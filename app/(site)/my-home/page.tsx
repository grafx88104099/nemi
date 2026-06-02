import { Home } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { HomeEstimator } from "@/components/home/HomeEstimator";
import { BackLink } from "@/components/ui/back-link";

export default function MyHomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <BackLink />
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Home className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Миний гэр</h1>
          <p className="text-sm text-muted">Гэрийнхээ зах зээлийн үнэлгээг тооцоол</p>
        </div>
      </div>
      <Card className="mt-6">
        <CardBody>
          <HomeEstimator />
        </CardBody>
      </Card>
    </div>
  );
}
