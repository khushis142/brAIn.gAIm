import { Component } from '@angular/core';
import { GamePlayable, GamePlayer } from '../../shared/game-player/game-player';

// TODO(temporary): this is a local-only preview harness for the Wordle prototype.
// It bypasses the backend entirely (no content registration, no AI-generated
// round data) so the game can be played and iterated on before any backend work.
// Remove this module once the game is registered through the real backend flow.
const WORDLE_PREVIEW: GamePlayable = {
  id: 'preview-wordle',
  title: 'Wordle (prototype)',
  url: '/assets/games/wordle/game.js',
  data: {
    context: 'No personalized data is generated for this game; the target word is picked by the fixed game code.',
  },
};

@Component({
  imports: [GamePlayer],
  selector: 'app-preview-wordle',
  styleUrl: './preview-wordle.css',
  templateUrl: './preview-wordle.html',
})
export class PreviewWordle {
  protected readonly game = WORDLE_PREVIEW;
}
