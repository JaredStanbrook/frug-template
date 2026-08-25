import type { FC } from "hono/jsx";

interface IconProps {
  icon: any; // Using any to be safe, but it expects IconData
  class?: string;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}

export const Icon: FC<IconProps> = ({ icon, ...props }) => {
  // 1. Standard Lucide Defaults (Missing from your data, so we hardcode them)
  const defaultAttrs = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };

  // 2. Merge with user props
  const svgAttrs = {
    ...defaultAttrs,
    class: props.class,
    width: props.size ?? defaultAttrs.width,
    height: props.size ?? defaultAttrs.height,
    stroke: props.color ?? defaultAttrs.stroke,
    "stroke-width": props.strokeWidth ?? defaultAttrs["stroke-width"],
  };

  // 3. Render the wrapper and map the children
  return (
    <svg {...svgAttrs}>
      {Array.isArray(icon) &&
        icon.map((child) => {
          const [tag, attrs] = child;
          // Hono JSX requires the tag to be cast to any or string for dynamic rendering
          const Tag = tag as any;
          return <Tag {...attrs} />;
        })}
    </svg>
  );
};
