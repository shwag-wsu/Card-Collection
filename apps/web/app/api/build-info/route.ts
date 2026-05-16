import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../lib/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBuildInfo());
}
