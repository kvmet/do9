addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
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
      return new Response("Image not found", { status: 404 });
    }

    // Return the image with appropriate headers
    return new Response(imageResponse.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return new Response("Error processing image", { status: 500 });
  }
}
