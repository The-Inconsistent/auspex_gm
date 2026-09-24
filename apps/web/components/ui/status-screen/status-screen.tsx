type StatusScreenProps = { text: string };

// Full-screen terminal status line: loading, access and error states.
export function StatusScreen({ text }: StatusScreenProps) {
  return (
    <main className="center">
      <p className="display">{text}</p>
    </main>
  );
}
