import { NextRequest } from 'next/server';
import { proxyToSdk } from '@/lib/sdk-proxy-to-agentic-backend';

export async function GET(req: NextRequest) { return proxyToSdk(req, 'GET'); }
export async function POST(req: NextRequest) { return proxyToSdk(req, 'POST'); }
export async function DELETE(req: NextRequest) { return proxyToSdk(req, 'DELETE'); }

