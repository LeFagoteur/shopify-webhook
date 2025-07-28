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

    // Configuration avec token d'accès direct
    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
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

    // Utilisation du token d'accès standard
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-01/collections.json`,
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
    console.log('Headers de la réponse:', Object.fromEntries(shopifyResponse.headers.entries()));

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
    console.log('Réponse brute Shopify:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Erreur de parsing JSON:', parseError);
      console.error('Contenu reçu:', responseText);
      return res.status(500).json({
        error: 'Réponse Shopify invalide',
        response: responseText
      });
    }
    
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
