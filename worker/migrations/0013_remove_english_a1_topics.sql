-- The English A1 topics were seeded by 0010. Their words were removed from the dataset,
-- so no word references them any more.
DELETE FROM topics WHERE lang = 'en' AND slug IN (
  'introductions', 'family-and-friends', 'home', 'food-and-drink', 'daily-routine',
  'time-and-planning', 'city-and-transport', 'shopping-and-clothes', 'health-and-body',
  'nature-and-weather', 'study-and-work', 'common-verbs', 'common-adjectives'
);
