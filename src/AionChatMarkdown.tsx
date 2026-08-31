import type { ComponentType } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";

/** Props supplied to the replaceable Markdown renderer slot. */
export interface AionChatMarkdownProps {
  readonly text: string;
}

/** Component type accepted by message and artifact Markdown slots. */
export type AionChatMarkdownComponent = ComponentType<AionChatMarkdownProps>;

function domProps<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const result = { ...props };
  delete result.node;
  return result;
}

const MARKDOWN_COMPONENTS: Components = {
  a({ href, children, ...props }) {
    if (!href) {
      return <span>{children}</span>;
    }
    const external = href?.startsWith("https://") || href?.startsWith("http://");
    return (
      <a
        {...domProps(props)}
        href={href}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  blockquote({ children, ...props }) {
    return <blockquote {...domProps(props)}>{children}</blockquote>;
  },
  code({ className, children, ...props }) {
    return (
      <code className={className} {...domProps(props)}>
        {children}
      </code>
    );
  },
  h1({ children, ...props }) {
    return <h1 {...domProps(props)}>{children}</h1>;
  },
  h2({ children, ...props }) {
    return <h2 {...domProps(props)}>{children}</h2>;
  },
  h3({ children, ...props }) {
    return <h3 {...domProps(props)}>{children}</h3>;
  },
  h4({ children, ...props }) {
    return <h4 {...domProps(props)}>{children}</h4>;
  },
  h5({ children, ...props }) {
    return <h5 {...domProps(props)}>{children}</h5>;
  },
  h6({ children, ...props }) {
    return <h6 {...domProps(props)}>{children}</h6>;
  },
  img({ alt }) {
    return (
      <span className="aion-chat__markdown-image">
        [Image: {alt ?? "unlabeled"}]
      </span>
    );
  },
  li({ children, ...props }) {
    return <li {...domProps(props)}>{children}</li>;
  },
  ol({ children, ...props }) {
    return <ol {...domProps(props)}>{children}</ol>;
  },
  p({ children, ...props }) {
    return <p {...domProps(props)}>{children}</p>;
  },
  table({ children, ...props }) {
    return <table {...domProps(props)}>{children}</table>;
  },
  tbody({ children, ...props }) {
    return <tbody {...domProps(props)}>{children}</tbody>;
  },
  td({ children, ...props }) {
    return <td {...domProps(props)}>{children}</td>;
  },
  th({ children, ...props }) {
    return <th {...domProps(props)}>{children}</th>;
  },
  thead({ children, ...props }) {
    return <thead {...domProps(props)}>{children}</thead>;
  },
  tr({ children, ...props }) {
    return <tr {...domProps(props)}>{children}</tr>;
  },
  ul({ children, ...props }) {
    return <ul {...domProps(props)}>{children}</ul>;
  },
};

/** Safely renders untrusted assistant Markdown as React elements. */
export function AionChatMarkdown({ text }: AionChatMarkdownProps) {
  return (
    <div className="aion-chat__markdown">
      <ReactMarkdown
        components={MARKDOWN_COMPONENTS}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
