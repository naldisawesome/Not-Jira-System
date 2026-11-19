"use client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { openImage } from "./image-viewer";

const withMentions = (s: string) => s.replace(/(^|[\s(])@([a-z0-9_.-]{2,40})/gi, (_, pre, u) => `${pre}[@${u}](mention:${u})`);

/** Safe markdown renderer: no raw HTML, sanitised URLs, inline images open in the lightbox. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const imgs: { url: string; name: string }[] = [];
  return (
    <div className={cn("prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-img:my-2 prose-img:cursor-zoom-in prose-img:rounded-lg prose-img:border", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("mention:") ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("mention:") ? (
              <span className="rounded bg-accent px-1 font-medium text-accent-foreground no-underline">{children}</span>
            ) : (
              <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer nofollow">{children}</a>
            ),
          img: ({ src, alt }) => {
            if (typeof src !== "string") return null;
            const idx = imgs.push({ url: src, name: alt || "image" }) - 1;
            const all = imgs;
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={src} alt={alt ?? ""} loading="lazy" onClick={() => openImage(all, idx)} className="max-h-[420px]" />;
          },
        }}
      >
        {withMentions(children)}
      </ReactMarkdown>
    </div>
  );
}
