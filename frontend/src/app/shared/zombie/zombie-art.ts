import { ZombieSlot } from '../../core/api.service';

// Every file in this folder shares viewBox="0 0 200 240", so layers line up without offsets
const ART_DIR = '/assets/zombie';

export const ZOMBIE_VIEW_BOX = '0 0 200 240';

/** Moving groups in zombie.svg, back to front */
export type ZombieAnchor = 'leg-l' | 'leg-r' | 'arm-l' | 'body' | 'arm-r' | 'head';
export const ZOMBIE_ANCHORS: readonly ZombieAnchor[] = [
  'leg-l',
  'leg-r',
  'arm-l',
  'body',
  'arm-r',
  'head',
];

/** Slots drawn back to front, so glasses sit under a hat brim */
export const SLOT_ORDER: readonly ZombieSlot[] = ['feet', 'neck', 'eyes', 'head'];

export interface AccessoryArt {
  /** Each part rides on a zombie group, so it moves with that limb */
  readonly parts: readonly { anchor: ZombieAnchor; href: string }[];
  /** Crop of the shared canvas used for wardrobe thumbnails */
  readonly thumbViewBox: string;
}

export const zombieHref = (anchor: ZombieAnchor) => `${ART_DIR}/zombie.svg#${anchor}`;
const href = (file: string, id: string) => `${ART_DIR}/${file}#${id}`;

/** Keyed by backend accessory id; ids without art are listed but not drawn */
export const ACCESSORY_ART: Readonly<Record<string, AccessoryArt>> = {
  hat: {
    parts: [{ anchor: 'head', href: href('hat.svg', 'hat') }],
    thumbViewBox: '60 6 80 46',
  },
  sunglasses: {
    parts: [{ anchor: 'head', href: href('sunglasses.svg', 'sunglasses') }],
    thumbViewBox: '56 40 88 38',
  },
  'gold-chain': {
    parts: [{ anchor: 'body', href: href('gold-chain.svg', 'gold-chain') }],
    thumbViewBox: '70 94 60 44',
  },
  'red-sneakers': {
    parts: [
      { anchor: 'leg-l', href: href('red-sneakers.svg', 'shoe-l') },
      { anchor: 'leg-r', href: href('red-sneakers.svg', 'shoe-r') },
    ],
    thumbViewBox: '64 188 72 44',
  },
};
