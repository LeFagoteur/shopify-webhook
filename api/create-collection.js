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

    // Configuration avec API Key et Secret
    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
    const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
    const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

    if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
      console.error('Configuration Shopify manquante');
      return res.status(500).json({ 
        error: 'Configuration Shopify manquante' 
      });
    }

    const tagCondition = `pro+${companyName.toLowerCase().replace(/\s+/g, '')}`;

    const collectionData = {
      collection: {
        title: companyName,
        rules: [
          {
            column: 'tag',
            relation: 'equals',
            condition: tagCondition
          }
        ],
        sort_order: 'best-selling'
      }
    };

    console.log('Création de la collection:', companyName, 'avec tag:', tagCondition);

    // Test avec authentification Basic (API Key + Secret)
    const credentials = btoa(`${SHOPIFY_API_KEY}:${SHOPIFY_API_SECRET}`);
    
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-01/collections.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
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
    
    console.log('Collection créée avec succès:', result.collection.id);
    
    return res.status(200).json({
      success: true,
      message: `Collection "${companyName}" créée avec succès`,
      collection_id: result.collection.id,
      collection_handle: result.collection.handle,
      tag_condition: tagCondition,
      customer_email: customer.email
    });

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ 
      error: 'Erreur interne',
      details: error.message 
    });
  }
}
