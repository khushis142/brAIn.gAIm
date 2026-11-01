import type { BasicScene, BasicSceneBox, WebGlCapabilities } from '../gameProtocol';

/** WebGL helpers behind api.webgl. */
export interface RuntimeWebgl {
  /** What api.webgl.capabilities reports before a WebGL context exists. */
  readonly unavailable: WebGlCapabilities;
  readCapabilities(gl: WebGLRenderingContext): WebGlCapabilities;
  /** api.webgl.createBasicScene: simple colored boxes, or null if the shaders fail. */
  createBasicScene(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): BasicScene | null;
}

/**
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeWebgl(): RuntimeWebgl {
  const unavailable: WebGlCapabilities = Object.freeze({
    available: false,
    webgl2: false,
    maxTextureSize: 0,
    maxViewportDimensions: [0, 0] as const,
    antialias: false,
    highPerformance: false,
    renderer: '',
  });

  function readCapabilities(gl: WebGLRenderingContext): WebGlCapabilities {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
      : gl.getParameter(gl.RENDERER) || '';
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [0, 0];
    return Object.freeze({
      available: true,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
      maxViewportDimensions: [maxViewport[0] || 0, maxViewport[1] || 0] as const,
      antialias: Boolean(gl.getContextAttributes?.()?.antialias),
      highPerformance: /angle|swiftshader|llvmpipe|software/i.test(rendererName) === false,
      renderer: String(rendererName),
    });
  }

  function createBasicScene(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): BasicScene | null {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return null;
    gl.shaderSource(vertexShader, 'attribute vec3 p; uniform mat4 m; void main(){gl_Position=m*vec4(p,1.0);}');
    gl.shaderSource(fragmentShader, 'precision mediump float; uniform vec4 u; void main(){gl_FragColor=u;}');
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const vertices = new Float32Array([
      -1,-1,-1, 1,0,0,1, 1,-1,-1, 0,1,0,1, 1,1,-1, 0,0,1,1, -1,1,-1, 1,1,0,1,
      -1,-1,1, 1,0,1,1, 1,-1,1, 0,1,1,1, 1,1,1, 1,1,1,1, -1,1,1, 0,0,0,1,
    ]);
    const indices = new Uint16Array([
      0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1,
      3,2,6, 3,6,7, 1,5,6, 1,6,2, 0,3,7, 0,7,4,
    ]);
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    const boxColor = gl.getUniformLocation(program, 'u');
    const matrix = gl.getUniformLocation(program, 'm');
    const boxes: { x: number; y: number; z: number; size: number; color: number[]; rotation: number }[] = [];
    const camera = { x: 0, y: 0, z: 5, fov: 60 };
    const multiply = (a: Float32Array, b: Float32Array): Float32Array => {
      const out = new Float32Array(16);
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
      }
      return out;
    };
    const perspective = (aspect: number): Float32Array => {
      const f = 1 / Math.tan(camera.fov * Math.PI / 360);
      const out = new Float32Array(16);
      out[0] = f / aspect; out[5] = f; out[10] = -1; out[11] = -1; out[14] = -0.2;
      return out;
    };
    const render = (timeSeconds = 0): void => {
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      const projection = perspective(canvas.width / Math.max(1, canvas.height));
      for (const box of boxes) {
        const c = Math.cos((box.rotation || 0) + timeSeconds * 0.2);
        const s = Math.sin((box.rotation || 0) + timeSeconds * 0.2);
        const model = new Float32Array([c*box.size,0,-s*box.size,0, 0,box.size,0,0, s*box.size,0,c*box.size,0, box.x,box.y,box.z,1]);
        const view = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -camera.x,-camera.y,-camera.z,1]);
        gl.uniformMatrix4fv(matrix, false, multiply(projection, multiply(view, model)));
        gl.uniform4fv(boxColor, box.color);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }
    };
    return {
      camera,
      addBox(box: BasicSceneBox = {}) {
        const item = { x: box.x || 0, y: box.y || 0, z: box.z || 0, size: box.size || 1, color: [...(box.color || [1, 1, 1, 1])], rotation: 0 };
        boxes.push(item);
        return item;
      },
      render,
      clear() { boxes.length = 0; },
    };
  }

  return { unavailable, readCapabilities, createBasicScene };
}
