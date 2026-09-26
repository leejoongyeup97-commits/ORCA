import Link from "next/link";

export default function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <section className="border-y border-dashed border-[#35383f] px-6 py-14 text-center">
      <p className="m-0 text-[15px] font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[12px] leading-6 text-[var(--muted)]">{description}</p>
      {href && action && (
        <Link href={href} className="app-secondary-button mt-4">
          {action}
        </Link>
      )}
    </section>
  );
}
