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

    // Requête GraphQL pour créer une collection
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

    console.log('Requête GraphQL:', JSON.stringify(graphqlQuery, null, 2));

    // Appel à l'API GraphQL
    const shopifyResponse = await fetch(
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

    console.log('Status de la réponse Shopify:', shopifyResponse.status);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Erreur Shopify (status:', shopifyResponse.status, '):', errorText);
      return res.status(400).json({ 
        error: 'Erreur lors de la création de la collection',
        status: shopifyResponse.status,
        details: errorText
      });
    }

    const responseText = await shopifyResponse.text();
    console.log('Réponse GraphQL complète:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Erreur de parsing JSON:', parseError);
      return res.status(500).json({
        error: 'Réponse Shopify invalide',
        response: responseText
      });
    }

    // Vérifier les erreurs GraphQL
    if (result.data && result.data.collectionCreate) {
      const { collection, userErrors } = result.data.collectionCreate;
      
      if (userErrors && userErrors.length > 0) {
        console.error('Erreurs utilisateur GraphQL:', userErrors);
        return res.status(400).json({
          error: 'Erreurs lors de la création',
          userErrors: userErrors
        });
      }

      if (collection) {
        console.log('Collection créée avec succès via GraphQL:', collection.id);
        
        return res.status(200).json({
          success: true,
          message: `Collection "${companyName}" créée avec succès`,
          collection_id: collection.id,
          collection_handle: collection.handle,
          tag_condition: tagCondition,
          customer_email: customer.email,
          method: 'GraphQL'
        });
      }
    }

    // Si on arrive ici, il y a eu un problème
    console.error('Réponse GraphQL inattendue:', result);
    return res.status(500).json({
      error: 'Réponse GraphQL inattendue',
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
