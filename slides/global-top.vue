<template></template>

<style>
:root {
  --slidev-theme-primary: #5a5bff;
}

.slidev-layout {
  background:
    radial-gradient(circle at 18% 15%, rgb(90 91 255 / 8%), transparent 24rem),
    #f7f8ff;
  color: #202133;
}

.title-slide {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 5rem;
}

.brand-logo {
  width: min(58vw, 46rem);
  height: auto;
}

.mobile-preview {
  box-sizing: border-box;
  width: auto;
  height: 100%;
  aspect-ratio: 9 / 19.5;
  padding: 0.6rem;
  overflow: hidden;
  border: 1px solid #e1e3f0;
  border-radius: 2.25rem;
  background: #fff;
  box-shadow: 0 28px 70px rgb(39 40 79 / 14%);
}

.preview-slide {
  width: 100%;
  height: 100%;
  padding: 0 !important;
}

.mobile-preview-stage {
  display: flex;
  width: 100%;
  height: 100%;
  justify-content: flex-end;
}

.mobile-preview iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 1.7rem;
}

.video-slide {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.demo-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 1rem;
  box-shadow: 0 28px 70px rgb(39 40 79 / 14%);
}
</style>
