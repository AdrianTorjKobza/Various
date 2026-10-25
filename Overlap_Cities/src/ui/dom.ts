type Child = Node | string | null | undefined | false;

interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

/**
 * Creates an element safely: text is always assigned via textContent and attributes via
 * setAttribute, so data can never be interpreted as HTML (no innerHTML anywhere in the app).
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, children: readonly Child[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

let uid = 0;
export const uniqueId = (prefix: string): string => `${prefix}-${++uid}`;
