export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const customer = req.body;
    
    console.log('Webhook reçu pour le client:', customer.email);
    console.log('Note du client:', customer.note);

    if (!customer.note || !customer.note.includes("Entreprise:")) {
      console.log('Pas d\'entreprise trouvée dans la note');
      return res.status(200).json({ 
        message: 'Pas d\'entreprise dans la note du client',
        skipped: true
      });
    }

    const entreprisePart = customer.note.split("Entreprise:")[1];
    const companyName = entreprisePart ? entreprisePart.trim() : "";

    if (!companyName) {
      console.log('Nom d\'entreprise vide');
      return res.status(200).json({ 
        message: 'Nom d\'entreprise vide',
        skipped: true
      });
    }

    console.log('Entreprise trouvée:', companyName);

    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Configuration Shopify manquante');
      return res.status(500).json({ 
        error: 'Configuration Shopify manquante' 
      });
    }

    const tagCondition = `pro${companyName.toLowerCase().replace(/\s+/g, '')}`;

    // APPROCHE 1: API REST Smart Collection avec publication directe
    const collectionData = {
      smart_collection: {
        title: companyName,
        rules: [
          {
            column: 'tag',
            relation: 'equals',
            condition: tagCondition
          }
        ],
        published: true,  // Publication directe !
        published_scope: 'web'  // Publier sur le web
      }
    };

    console.log('Création collection REST avec publication:', JSON.stringify(collectionData, null, 2));

    // Appel à l'API REST Smart Collections
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-01/smart_collections.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(collectionData)
      }
    );

    console.log('Status de la réponse Shopify:', shopifyResponse.status);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Erreur Shopify (status:', shopifyResponse.status, '):', errorText);
      
      // Si REST échoue, fallback vers GraphQL
      console.log('🔄 Fallback vers GraphQL...');
      return await createWithGraphQL(companyName, tagCondition, SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, customer, res);
    }

    const result = await shopifyResponse.json();
    console.log('✅ Collection REST créée:', result);

    if (result.smart_collection) {
      const collection = result.smart_collection;
      
      return res.status(200).json({
        success: true,
        message: `Collection "${companyName}" créée et publiée avec succès via REST`,
        collection_id: collection.id,
        collection_handle: collection.handle,
        collection_url: `https://studio.lefagoteur.com/collections/${collection.handle}`,
        tag_condition: tagCondition,
        customer_email: customer.email,
        method: 'REST API',
        published: collection.published_at ? true : false,
        published_at: collection.published_at
      });
    }

    return res.status(500).json({
      error: 'Réponse REST inattendue',
      response: result
    });

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ 
      error: 'Erreur interne',
      details: error.message 
    });
  }
}

// Fonction fallback GraphQL
async function createWithGraphQL(companyName, tagCondition, domain, token, customer, res) {
  const graphqlQuery = {
    query: `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            handle
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    variables: {
      input: {
        title: companyName,
        ruleSet: {
          appliedDisjunctively: false,
          rules: [
            {
              column: "TAG",
              relation: "EQUALS",
              condition: tagCondition
            }
          ]
        }
      }
    }
  };

  console.log('Fallback GraphQL:', JSON.stringify(graphqlQuery, null, 2));

  const shopifyResponse = await fetch(
    `https://${domain}/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify(graphqlQuery)
    }
  );

  if (!shopifyResponse.ok) {
    const errorText = await shopifyResponse.text();
    return res.status(400).json({ 
      error: 'Erreur lors de la création de la collection (REST et GraphQL)',
      details: errorText
    });
  }

  const result = await shopifyResponse.json();

  if (result.data && result.data.collectionCreate && result.data.collectionCreate.collection) {
    const collection = result.data.collectionCreate.collection;
    
    return res.status(200).json({
      success: true,
      message: `Collection "${companyName}" créée via GraphQL (publication manuelle requise)`,
      collection_id: collection.id,
      collection_handle: collection.handle,
      collection_url: `https://studio.lefagoteur.com/collections/${collection.handle}`,
      tag_condition: tagCondition,
      customer_email: customer.email,
      method: 'GraphQL Fallback',
      note: 'Publication manuelle requise dans l\'admin'
    });
  }

  return res.status(500).json({
    error: 'Échec REST et GraphQL',
    response: result
  });
}
