declare namespace React {
  type ReactNode = any;
  interface FunctionComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode;
  }
  type FC<P = {}> = FunctionComponent<P>;

  interface SyntheticEvent<T = Element, E = Event> {
    target: T;
    currentTarget: T;
    nativeEvent: E;
    preventDefault(): void;
    stopPropagation(): void;
  }

  interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  interface ChangeEvent<T = Element> extends SyntheticEvent<T> {}

  type SetStateAction<S> = S | ((prevState: S) => S);
  type Dispatch<A> = (value: A) => void;

  function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  function useMemo<T>(factory: () => T, deps: readonly any[]): T;
}

export const useState: typeof React.useState;
export const useMemo: typeof React.useMemo;
export type FC<P = {}> = React.FC<P>;
export type FormEvent<T = Element> = React.FormEvent<T>;
export type ChangeEvent<T = Element> = React.ChangeEvent<T>;
export type ReactNode = React.ReactNode;
export default React;
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
