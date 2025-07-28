// Fichier : api/create-collection.js
// Version adaptée pour les webhooks Shopify natifs

export default async function handler(req, res) {
  // Vérifier que c'est une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Les données viennent directement du webhook Shopify
    const customer = req.body;
    
    console.log('Webhook reçu pour le client:', customer.email);
    console.log('Note du client:', customer.note);

    // Vérifier si la note contient "Entreprise:"
    if (!customer.note || !customer.note.includes("Entreprise:")) {
      console.log('Pas d\'entreprise trouvée dans la note');
      return res.status(200).json({ 
        message: 'Pas d\'entreprise dans la note du client',
        skipped: true
      });
    }

    // Extraire le nom de l'entreprise
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

    // Configuration de l'API Shopify
    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Configuration Shopify manquante');
      return res.status(500).json({ 
        error: 'Configuration Shopify manquante' 
      });
    }

    // Créer le tag pour la collection
    const tagCondition = `pro+${companyName.toLowerCase().replace(/\s+/g, '')}`;

    // Préparer les données de la collection
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

    // Appel à l'API Shopify pour créer la collection
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-07/collections.json`,
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
