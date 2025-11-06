declare namespace React {
  type ReactNode = any;
  interface FunctionComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode;
  }
  type FC<P = {}> = FunctionComponent<P>;
}

export = React;
export as namespace React;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
  }
}
