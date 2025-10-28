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

    // ✨ Le tag devient le handle de la collection
    const tagCondition = `pro${companyName.toLowerCase().replace(/\s+/g, '-')}`;
    const collectionHandle = tagCondition; // Le handle = le tag complet !

    console.log('Tag créé:', tagCondition);
    console.log('Handle de collection:', collectionHandle);

    // ✨ ÉTAPE 1 : Vérifier si la collection existe déjà
    const existingCollection = await checkCollectionExists(collectionHandle, SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN);
    
    if (existingCollection) {
      console.log('✅ Collection existante trouvée:', existingCollection.id);
      return res.status(200).json({
        success: true,
        message: `Collection "${companyName}" existe déjà, pas de création`,
        collection_id: existingCollection.id,
        collection_handle: existingCollection.handle,
        collection_url: `https://studio.lefagoteur.com/collections/${existingCollection.handle}`,
        tag_condition: tagCondition,
        customer_email: customer.email,
        action: 'existing_collection_reused'
      });
    }

    // ✨ ÉTAPE 2 : Créer la collection avec le handle personnalisé (via GraphQL)
    const graphqlQuery = {
      query: `
        mutation collectionCreate($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              handle
              title
              publishedOnCurrentPublication
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
          title: companyName,  // Titre propre : "La Fabrik"
          handle: collectionHandle,  // Handle sécurisé : "prola-fabrik"
          ruleSet: {
            appliedDisjunctively: false,
            rules: [
              {
                column: "TAG",
                relation: "EQUALS",
                condition: tagCondition  // Condition : "prola-fabrik"
              }
            ]
          },
          // Publication directe sur Online Store
          publications: [
            {
              publicationId: "gid://shopify/Publication/300101337352"
            }
          ]
        }
      }
    };

    console.log('Création collection GraphQL:', JSON.stringify(graphqlQuery, null, 2));

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

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Erreur Shopify GraphQL:', errorText);
      return res.status(400).json({ 
        error: 'Erreur lors de la création de la collection',
        details: errorText
      });
    }

    const result = await shopifyResponse.json();

    // Vérifier les erreurs GraphQL
    if (result.data?.collectionCreate?.userErrors?.length > 0) {
      console.error('Erreurs GraphQL:', result.data.collectionCreate.userErrors);
      return res.status(400).json({
        error: 'Erreurs lors de la création',
        userErrors: result.data.collectionCreate.userErrors
      });
    }

    if (result.data?.collectionCreate?.collection) {
      const collection = result.data.collectionCreate.collection;
      
      console.log('✅ Collection créée:', collection);

      return res.status(200).json({
        success: true,
        message: `Collection "${companyName}" créée avec succès`,
        collection_id: collection.id,
        collection_handle: collection.handle,
        collection_url: `https://studio.lefagoteur.com/collections/${collection.handle}`,
        tag_condition: tagCondition,
        customer_email: customer.email,
        method: 'GraphQL',
        published: collection.publishedOnCurrentPublication,
        action: 'new_collection_created'
      });
    }

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

// ✨ Fonction pour vérifier si une collection existe déjà
async function checkCollectionExists(handle, domain, token) {
  try {
    const graphqlQuery = {
      query: `
        query getCollectionByHandle($handle: String!) {
          collectionByHandle(handle: $handle) {
            id
            handle
            title
            publishedOnCurrentPublication
          }
        }
      `,
      variables: {
        handle: handle
      }
    };

    console.log('Vérification collection existante avec handle:', handle);

    const response = await fetch(
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

    if (!response.ok) {
      console.error('Erreur lors de la vérification:', response.status);
      return null;
    }

    const result = await response.json();
    
    if (result.data?.collectionByHandle) {
      console.log('Collection trouvée:', result.data.collectionByHandle);
      return result.data.collectionByHandle;
    }

    console.log('Aucune collection trouvée avec ce handle');
    return null;

  } catch (error) {
    console.error('Erreur checkCollectionExists:', error);
    return null;
  }
}
