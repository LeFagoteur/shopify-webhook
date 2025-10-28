// Script temporaire pour récupérer votre Publication ID
// À exécuter une seule fois, puis à supprimer

export default async function handler(req, res) {
  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ 
      error: 'Configuration Shopify manquante' 
    });
  }

  const graphqlQuery = {
    query: `
      {
        publications(first: 10) {
          edges {
            node {
              id
              name
              supportsFuturePublishing
            }
          }
        }
      }
    `
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(graphqlQuery)
      }
    );

    const result = await response.json();

    console.log('Publications disponibles:', JSON.stringify(result, null, 2));

    // Trouver "Online Store"
    const publications = result.data?.publications?.edges || [];
    const onlineStore = publications.find(
      edge => edge.node.name === "Online Store"
    );

    if (onlineStore) {
      return res.status(200).json({
        success: true,
        message: 'Publication ID trouvé !',
        publication_id: onlineStore.node.id,
        publication_name: onlineStore.node.name,
        instructions: `
          Copiez cet ID dans votre webhook à la ligne 84 :
          publicationId: "${onlineStore.node.id}"
        `,
        all_publications: publications.map(edge => ({
          id: edge.node.id,
          name: edge.node.name
        }))
      });
    }

    return res.status(200).json({
      message: 'Publications trouvées, mais pas "Online Store"',
      publications: publications.map(edge => ({
        id: edge.node.id,
        name: edge.node.name
      }))
    });

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ 
      error: 'Erreur lors de la récupération',
      details: error.message 
    });
  }
}
