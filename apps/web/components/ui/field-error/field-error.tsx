type FieldErrorProps = { id: string; error?: string };

// Why CREATE, ADD or SAVE refused a field, under it (useFieldErrors). The field's input points here with
// aria-describedby, and the line is announced when it appears.
export function FieldError({ id, error }: FieldErrorProps) {
  if (!error) return null;
  return (
    <div id={id} className="red" role="alert" style={{ fontSize: 13 }}>
      ! {error}
    </div>
  );
}
