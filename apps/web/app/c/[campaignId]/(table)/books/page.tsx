"use client";
import { Books } from "@/components/gm/books/books";
import { useGm } from "@/components/gm/gm-app/gm-context";

export default function BooksPage() {
  return <Books server={useGm().bookServer} />;
}
