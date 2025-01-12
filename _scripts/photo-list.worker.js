export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://do9.co",
      "Access-Control-Allow-Methods": "GET, HEAD",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    let prefix = url.pathname.slice(1); // Remove leading slash
    if (!prefix.startsWith("photo/")) {
      prefix = "photo/";
    }

    try {
      const listed = await env.PHOTO_BUCKET.list({
        prefix: prefix,
        delimiter: "/",
      });

      // Filter out empty directory markers
      const objects = listed.objects.filter((obj) => obj.size > 0);

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>${prefix}</Name>
  <Prefix>${prefix}</Prefix>
  <Directories>
    ${listed.delimitedPrefixes
      .map((prefix) => `    <Directory>${prefix}</Directory>`)
      .join("\n")}
  </Directories>
  <Files>
    ${objects
      .map(
        (obj) =>
          `    <File>
      <Key>${obj.key}</Key>
      <LastModified>${new Date(obj.uploaded).toISOString()}</LastModified>
      <Size>${obj.size}</Size>
    </File>`,
      )
      .join("\n")}
  </Files>
</ListBucketResult>`;

      return new Response(xml, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/xml",
        },
      });
    } catch (error) {
      console.error("Error:", error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
