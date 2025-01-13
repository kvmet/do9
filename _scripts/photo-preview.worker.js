addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Add CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://do9.co",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Max-Age": "86400",
  };

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  // Get everything after workers.dev
  const imagePath = url.pathname;

  // Define standard preview options
  const previewOptions = [
    "width=250",
    "quality=75",
    "fit=scale-down",
    "format=jpeg",
    "metadata=keep",
  ].join(",");

  // Generate the resized image URL
  const resizedImageUrl = `https://i.do9.co/cdn-cgi/image/${previewOptions}${imagePath}`;

  try {
    // Fetch and return the resized image
    const imageResponse = await fetch(resizedImageUrl);
    if (!imageResponse.ok) {
      return new Response("Image not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Return the image with appropriate headers
    return new Response(imageResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return new Response("Error processing image", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
