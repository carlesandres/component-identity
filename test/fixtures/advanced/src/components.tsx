import { forwardRef, memo } from "react";

export default function DefaultFunction() {
  return <div data-component="default-function" />;
}

const DefaultConst = () => <section data-component="default-const" />;
export default DefaultConst;

const ListedExport = () => <main data-component="listed-export" />;
export { ListedExport };

const MemoBase = () => <article data-component="memo-base-export" />;
export const MemoBaseExport = memo(MemoBase);

export const NestedWrapper = forwardRef(memo(() => <button data-component="nested-wrapper" />));

export const FragmentRoot = () => (
  <>
    {null}
    <aside data-component="fragment-root" />
  </>
);

export const SlotRoot = () => (
  <Slot>
    <a data-component="slot-root" />
  </Slot>
);

export const IgnoredByName = () => <div />;
export const CustomRoot = () => <Card />;
export const EmptyFragment = () => <></>;
