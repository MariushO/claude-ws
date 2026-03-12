import { NextRequest } from 'next/server';
import { proxyToSdk } from '@/lib/sdk-proxy-to-agentic-backend';

export async function DELETE(req: NextRequest) { return proxyToSdk(req, 'DELETE'); }
export async function POST(req: NextRequest) { return proxyToSdk(req, 'POST'); }
export async function PATCH(req: NextRequest) { return proxyToSdk(req, 'PATCH'); }
export async function PUT(req: NextRequest) { return proxyToSdk(req, 'PUT'); }

