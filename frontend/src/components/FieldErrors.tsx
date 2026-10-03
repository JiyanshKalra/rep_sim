// Renders validation messages below a form field.
// Renders nothing when there are no messages so callers never need to guard.

interface Props {
  id: string;
  messages: string[];
}

export default function FieldErrors({ id, messages }: Props) {
  if (messages.length === 0) return null;
  return (
    <>
      {messages.map((msg) => (
        <p key={msg} id={id} className="field-error">
          {msg}
        </p>
      ))}
    </>
  );
}
