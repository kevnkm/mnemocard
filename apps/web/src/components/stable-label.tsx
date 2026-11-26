/**
 * Text that can switch to a medium weight (e.g. when active) without changing
 * its width: an invisible medium-weight copy reserves the space.
 */
export function StableLabel({ children }: { children: string }) {
  return (
    <span className="inline-grid">
      <span aria-hidden="true" className="col-start-1 row-start-1 invisible font-medium">
        {children}
      </span>
      <span className="col-start-1 row-start-1">{children}</span>
    </span>
  );
}
