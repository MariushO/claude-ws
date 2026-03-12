import { NextRequest } from 'next/server';
import { proxyToSdk } from '@/lib/sdk-proxy-to-agentic-backend';

export async function POST(req: NextRequest) { return proxyToSdk(req, 'POST'); }

