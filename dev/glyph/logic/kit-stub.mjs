// Stand-ins for gpui-kit / gpui-base: every builder call is recorded on a plain node,
// so a test can find an element by id and call the handlers the mod gave it.
function el(kind, arg) {
  const node = { kind, arg, id: null, props: {}, handlers: {}, children: [] };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key === "__node") return target;
      if (typeof key !== "string") return undefined;
      return (...args) => {
        if (key === "when") return args[0] ? args[1](proxy) : proxy;
        if (key === "child") { target.children.push(args[0]); return proxy; }
        if (key === "children") { target.children.push(...args[0]); return proxy; }
        if (key === "id") { target.id = args[0]; return proxy; }
        if (key === "hover") return proxy;
        if (key.startsWith("on_")) {
          const name = key + (typeof args[0] === "string" ? ":" + args[0] : "");
          target.handlers[name] = args[args.length - 1];
          return proxy;
        }
        target.props[key] = args;
        return proxy;
      };
    },
  });
  return proxy;
}
export const div = () => el("div"), svg = (p) => el("svg", p), image = (p) => el("image", p);
export const h_flex = () => el("h_flex"), v_flex = () => el("v_flex");
export class View {}
export function walk(root, fn) {
  const node = root?.__node;
  if (!node) return;
  fn(node);
  for (const c of node.children) walk(c, fn);
}
export function byId(root, id) {
  let found = null;
  walk(root, (n) => { if (n.id === id) found = n; });
  return found;
}
