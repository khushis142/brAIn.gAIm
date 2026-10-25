/** Types shared by the runtime parts. Type-only: nothing here exists at runtime. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
