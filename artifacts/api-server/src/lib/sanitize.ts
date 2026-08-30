import sanitize from "sanitize-html";

export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== "string") return "";
  return sanitize(dirty, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "strong", "em", "b", "i", "u", "s", "mark", "small", "sub", "sup",
      "a", "img", "figure", "figcaption",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span",
    ],
    allowedAttributes: {
      "a": ["href", "title", "target", "rel"],
      "img": ["src", "alt", "title", "width", "height"],
      "div": ["class", "id"],
      "span": ["class", "id"],
      "p": ["class", "id"],
      "h1": ["class", "id"], "h2": ["class", "id"], "h3": ["class", "id"],
      "h4": ["class", "id"], "h5": ["class", "id"], "h6": ["class", "id"],
      "blockquote": ["class"],
      "pre": ["class"], "code": ["class"],
      "table": ["class"], "th": ["scope", "colspan", "rowspan"], "td": ["colspan", "rowspan"],
      "figure": ["class"], "figcaption": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    transformTags: {
      "a": (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}
