import { Card, PageHeader } from "@/components/ui";

// Honest placeholder: says what the area will do and when, without fake data.
export function ComingSoon({ title, delivery, items }: { title: string; delivery: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} description={`Esta área chega na ${delivery}. Nada aqui é simulado.`} />
      <Card>
        <h2 className="mb-3 font-medium">O que vai ter</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted">
          {items.map(item => <li key={item}>{item}</li>)}
        </ul>
      </Card>
    </>
  );
}
