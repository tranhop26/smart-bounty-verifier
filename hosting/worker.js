const staticAssets = {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response("Static asset binding unavailable", { status: 503 });
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return response;
    }

    const url = new URL(request.url);
    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

export default staticAssets;
