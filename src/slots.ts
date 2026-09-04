import type { ComponentType } from "react";

/**
 * A replaceable component plus optional default props for one UI slot.
 *
 * Controller-owned props are excluded by the slot declaration and always
 * supplied by the rendering surface.
 */
export interface AionSlotValue<
  Props extends object,
  OwnedProps extends keyof Props = never,
> {
  readonly component?: ComponentType<Props>;
  readonly props?: Partial<Omit<Props, OwnedProps>>;
}
