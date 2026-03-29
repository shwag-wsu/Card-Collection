import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.roiScenario.deleteMany();
  await prisma.gradingQuote.deleteMany();
  await prisma.gradeEstimate.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.collectionItem.deleteMany();
  await prisma.card.deleteMany();

  const cards = await prisma.card.createManyAndReturn({
    data: [
      {
        game: 'Pokemon',
        year: 1999,
        manufacturer: 'Wizards of the Coast',
        set_name: 'Base Set',
        player_name: null,
        character_name: 'Charizard',
        card_number: '4/102',
        language: 'English',
        notes: 'Shadowless style sample for MVP seed data',
      },
      {
        game: 'Baseball',
        sport: 'Baseball',
        year: 1989,
        manufacturer: 'Upper Deck',
        set_name: 'Upper Deck Baseball',
        player_name: 'Ken Griffey Jr.',
        card_number: '1',
        language: 'English',
      },
      {
        game: 'Basketball',
        sport: 'Basketball',
        year: 1986,
        manufacturer: 'Fleer',
        set_name: 'Fleer Basketball',
        player_name: 'Michael Jordan',
        card_number: '57',
        language: 'English',
        variation: 'Rookie Card',
      },
    ],
  });

  await prisma.collectionItem.createMany({
    data: [
      {
        card_id: cards[0].id,
        quantity: 1,
        purchase_price: '220.00',
        estimated_raw_value: '325.00',
        ownership_status: 'owned',
        storage_box: 'Pokemon Binder A',
      },
      {
        card_id: cards[1].id,
        quantity: 2,
        purchase_price: '90.00',
        estimated_raw_value: '160.00',
        ownership_status: 'owned',
        storage_box: 'Sports Box 1',
      },
      {
        card_id: cards[2].id,
        quantity: 1,
        purchase_price: '750.00',
        estimated_raw_value: '1000.00',
        ownership_status: 'owned',
        storage_box: 'Sports Box 1',
      },
    ],
  });

  console.log(`Seeded ${cards.length} cards and sample collection items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
