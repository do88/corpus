import type * as React from "react";

/**
 * Types for React's `<ViewTransition>`, which this React ships but does not
 * declare.
 *
 * The component is real at runtime — Next vendors its own React build and that
 * one exports it — but `@types/react` for the stable 19.x line does not carry
 * the declaration yet. Without this the import is a type error against a value
 * that exists.
 *
 * Deliberately narrow: only the props actually used are declared, so if the
 * real API lands and differs, the mismatch surfaces here rather than being
 * silently absorbed by an `any`.
 */
declare module "react" {
  /** `"auto"`, `"none"`, or a CSS class matched by `::view-transition-*`. */
  type ViewTransitionClass = string;

  /** A class per transition type. React requires the `default` key. */
  type ViewTransitionClassPerType = Record<string, ViewTransitionClass> & {
    default: ViewTransitionClass;
  };

  type ViewTransitionValue = ViewTransitionClass | ViewTransitionClassPerType;

  interface ViewTransitionProps {
    children?: React.ReactNode;
    /** Pairs with the same name on another boundary to morph between them. */
    name?: string;
    default?: ViewTransitionValue;
    enter?: ViewTransitionValue;
    exit?: ViewTransitionValue;
    share?: ViewTransitionValue;
    update?: ViewTransitionValue;
  }

  const ViewTransition: React.ComponentType<ViewTransitionProps>;
}
