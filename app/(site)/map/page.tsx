import { ListingsMap } from "@/components/map/ListingsMap";

export default function MapPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-extrabold text-ink">Газрын зураг дээрх зар</h1>
      <ListingsMap />
    </div>
  );
}
