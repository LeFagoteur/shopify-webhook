// Fichier à créer : api/create-collection.js

export default async function handler(req, res) {
  // Vérifier que c'est une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { company_name, tag_condition, customer_id } = req.body;

    if (!company_name || !tag_condition) {
      return res.status(400).json({ 
        error: 'company_name et tag_condition sont requis' 
      });
    }

    // Configuration de l'API Shopify
    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN; // votre-shop.myshopify.com
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // votre token d'accès

    if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'Configuration Shopify manquante' 
      });
    }

    // Préparer les données de la collection
    const collectionData = {
      collection: {
        title: company_name,
        rules: [
          {
            column: 'tag',
            relation: 'equals',
            condition: tag_condition
          }
        ],
        sort_order: 'best-selling'
      }
    };

    // Appel à l'API Shopify pour créer la collection
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/collections.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(collectionData)
      }
    );

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Erreur Shopify:', errorData);
      return res.status(400).json({ 
        error: 'Erreur lors de la création de la collection',
        details: errorData
      });
    }

    const result = await shopifyResponse.json();
    
    return res.status(200).json({
      success: true,
      message: `Collection "${company_name}" créée avec succès`,
      collection_id: result.collection.id,
      collection_handle: result.collection.handle,
      tag_condition: tag_condition
    });

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ 
      error: 'Erreur interne',
      details: error.message 
    });
  }
}
