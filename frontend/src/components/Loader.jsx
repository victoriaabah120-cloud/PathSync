export default function Loader({ text = "Loading..." }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-space-md py-24 text-center" role="status">
      <div className="ps-spinner" />
      <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
    </div>
  );
}
