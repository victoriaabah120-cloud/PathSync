// Shows text with blank lines as separate paragraphs.
export default function Paragraphs({ text }) {
  return (
    <>
      {String(text || "")
        .split(/\n{2,}/)
        .filter((part) => part.trim())
        .map((part, i) => (
          <p key={i}>{part.trim()}</p>
        ))}
    </>
  );
}
