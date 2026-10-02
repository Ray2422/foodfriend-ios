import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";

type Nutriments = {
  "energy-kcal_100g"?: number;
  energy_kcal_100g?: number;
  energy_100g?: number;
  sugars_100g?: number;
  "saturated-fat_100g"?: number;
  salt_100g?: number;
};

type Product = {
  code?: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  labels?: string;
  allergens?: string;
  allergens_tags?: string[];
  traces?: string;
  traces_tags?: string[];
  nutrition_grades?: string;
  nutriments?: Nutriments;
};

type BarcodeResult = {
  data: string;
};

type SearchMode = "barcode" | "name";

type StatusKind = "good" | "danger";

type StatusResult = {
  kind: StatusKind;
  label: string;
  explanation: string;
};

type Preferences = {
  showVegan: boolean;
  showVegetarian: boolean;
  showHalal: boolean;
  allergyMilk: boolean;
  allergyEgg: boolean;
  allergyPeanut: boolean;
  allergyTreeNuts: boolean;
  allergyGluten: boolean;
  allergySoy: boolean;
  allergySesame: boolean;
};

type AllergyCheck = {
  preference: keyof Preferences;
  title: string;
  ingredientWords: string[];
  allergenTags: string[];
};

const PRODUCT_API_URL = "https://world.openfoodfacts.org/api/v2/product";

const FAVOURITES_STORAGE_KEY = "foodfriend_favourites";
const PREFERENCES_STORAGE_KEY = "foodfriend_preferences";

const STARTER_PRODUCTS: Product[] = [
  {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Nutella, Ferrero",
  },
  {
    code: "7622201693688",
    product_name: "Toblerone truffles",
    brands: "Toblerone",
  },
  {
    code: "7622210449283",
    product_name: "Oreo Original",
    brands: "Oreo, Mondelez",
  },
  {
    code: "5449000000996",
    product_name: "Coca-Cola Original Taste",
    brands: "Coca-Cola",
  },
  {
    code: "5000168152901",
    product_name: "Cadbury Dairy Milk",
    brands: "Cadbury",
  },
];

const defaultPreferences: Preferences = {
  showVegan: true,
  showVegetarian: true,
  showHalal: true,
  allergyMilk: false,
  allergyEgg: false,
  allergyPeanut: false,
  allergyTreeNuts: false,
  allergyGluten: false,
  allergySoy: false,
  allergySesame: false,
};

const veganProhibitedWords = [
  "milk",
  "milk powder",
  "skimmed milk",
  "whey",
  "whey powder",
  "casein",
  "caseinate",
  "lactose",
  "butter",
  "cream",
  "cheese",
  "yoghurt",
  "yogurt",
  "egg",
  "egg powder",
  "gelatin",
  "gelatine",
  "honey",
  "fish",
  "meat",
  "beef",
  "chicken",
  "pork",
  "lard",
];

const vegetarianProhibitedWords = [
  "meat",
  "beef",
  "chicken",
  "pork",
  "fish",
  "lard",
  "gelatin",
  "gelatine",
];

const halalProhibitedWords = [
  "pork",
  "bacon",
  "ham",
  "lard",
  "blood",
  "carrion",
  "alcohol",
  "wine",
  "beer",
  "rum",
  "brandy",
];

const allergyChecks: AllergyCheck[] = [
  {
    preference: "allergyMilk",
    title: "Milk / dairy",
    ingredientWords: [
      "milk",
      "whey",
      "casein",
      "butter",
      "cream",
      "cheese",
      "lactose",
      "yoghurt",
      "yogurt",
    ],
    allergenTags: ["en:milk"],
  },
  {
    preference: "allergyEgg",
    title: "Egg",
    ingredientWords: ["egg", "albumen", "albumin"],
    allergenTags: ["en:eggs"],
  },
  {
    preference: "allergyPeanut",
    title: "Peanut",
    ingredientWords: ["peanut", "groundnut"],
    allergenTags: ["en:peanuts"],
  },
  {
    preference: "allergyTreeNuts",
    title: "Tree nuts",
    ingredientWords: [
      "almond",
      "hazelnut",
      "cashew",
      "walnut",
      "pecan",
      "pistachio",
      "macadamia",
      "brazil nut",
    ],
    allergenTags: ["en:nuts"],
  },
  {
    preference: "allergyGluten",
    title: "Gluten",
    ingredientWords: [
      "wheat",
      "barley",
      "rye",
      "oats",
      "gluten",
      "spelt",
      "malt",
    ],
    allergenTags: [
      "en:gluten",
      "en:wheat",
      "en:barley",
      "en:rye",
      "en:oats",
    ],
  },
  {
    preference: "allergySoy",
    title: "Soy",
    ingredientWords: ["soy", "soya", "soybean"],
    allergenTags: ["en:soybeans"],
  },
  {
    preference: "allergySesame",
    title: "Sesame",
    ingredientWords: ["sesame", "tahini"],
    allergenTags: ["en:sesame-seeds"],
  },
];

function getIngredients(product: Product): string {
  return (
    product.ingredients_text_en ||
    product.ingredients_text ||
    ""
  );
}

function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[(),.;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findWords(text: string, words: string[]): string[] {
  const cleanText = normaliseText(text);

  return words.filter((word) =>
    cleanText.includes(normaliseText(word))
  );
}

function getStrictDecision(
  product: Product,
  prohibitedWords: string[],
  categoryName: string
): StatusResult {
  const ingredients = getIngredients(product);
  const matches = findWords(ingredients, prohibitedWords);

  if (!ingredients.trim()) {
    return {
      kind: "danger",
      label: "Not suitable",
      explanation:
        "No ingredient list was available, so FoodFriend cannot confirm suitability.",
    };
  }

  if (matches.length > 0) {
    return {
      kind: "danger",
      label: "Not suitable",
      explanation: `Detected ingredient concern: ${matches.join(", ")}.`,
    };
  }

  return {
    kind: "good",
    label: "Suitable",
    explanation: `No prohibited ${categoryName} ingredients were detected in the available ingredient list.`,
  };
}

function getStrictHalalDecision(product: Product): StatusResult {
  const ingredients = getIngredients(product);
  const matches = findWords(ingredients, halalProhibitedWords);

  if (!ingredients.trim()) {
    return {
      kind: "danger",
      label: "Not suitable",
      explanation:
        "No ingredient list was available, so FoodFriend cannot confirm suitability.",
    };
  }

  if (matches.length > 0) {
    return {
      kind: "danger",
      label: "Not suitable",
      explanation: `Detected prohibited halal-related term: ${matches.join(
        ", "
      )}.`,
    };
  }

  return {
    kind: "good",
    label: "Suitable",
    explanation:
      "No pork, alcohol, or other prohibited terms were detected in the available ingredient list. This is not official halal certification.",
  };
}

function getAllergyWarnings(
  product: Product,
  preferences: Preferences
): string[] {
  const ingredients = getIngredients(product);
  const allergenTags = product.allergens_tags || [];
  const allergenText = `${product.allergens || ""} ${
    product.traces || ""
  }`.toLowerCase();

  const warnings: string[] = [];

  for (const allergy of allergyChecks) {
    if (!preferences[allergy.preference]) {
      continue;
    }

    const ingredientMatches = findWords(
      ingredients,
      allergy.ingredientWords
    );

    const hasMatchingTag = allergy.allergenTags.some((tag) =>
      allergenTags.includes(tag)
    );

    const hasMatchingAllergenText = allergy.ingredientWords.some((word) =>
      allergenText.includes(word.toLowerCase())
    );

    if (
      ingredientMatches.length > 0 ||
      hasMatchingTag ||
      hasMatchingAllergenText
    ) {
      const reasons = [
        ...ingredientMatches,
        ...(hasMatchingTag ? ["listed allergen"] : []),
        ...(hasMatchingAllergenText ? ["allergen/traces data"] : []),
      ];

      warnings.push(
        `${allergy.title}: possible match (${[
          ...new Set(reasons),
        ].join(", ")})`
      );
    }
  }

  return warnings;
}

function getKcalPer100g(product: Product): number | null {
  const nutriments = product.nutriments;

  if (!nutriments) {
    return null;
  }

  if (typeof nutriments["energy-kcal_100g"] === "number") {
    return nutriments["energy-kcal_100g"];
  }

  if (typeof nutriments.energy_kcal_100g === "number") {
    return nutriments.energy_kcal_100g;
  }

  if (typeof nutriments.energy_100g === "number") {
    return Math.round(nutriments.energy_100g / 4.184);
  }

  return null;
}

function formatNutritionValue(
  value: number | undefined,
  unit: string
): string {
  if (typeof value !== "number") {
    return "Not available";
  }

  const roundedValue =
    value >= 10 ? value.toFixed(1) : value.toFixed(2);

  return `${roundedValue} ${unit}`;
}

function NutritionCard({ product }: { product: Product }) {
  const nutriments = product.nutriments;
  const nutriGrade = product.nutrition_grades?.toUpperCase();
  const kcal = getKcalPer100g(product);

  const hasNutritionData =
    !!nutriGrade ||
    kcal !== null ||
    typeof nutriments?.sugars_100g === "number" ||
    typeof nutriments?.["saturated-fat_100g"] === "number" ||
    typeof nutriments?.salt_100g === "number";

  if (!hasNutritionData) {
    return (
      <View style={styles.nutritionUnavailable}>
        <Text style={styles.nutritionUnavailableText}>
          Nutrition information is not available for this product.
        </Text>
      </View>
    );
  }

  const nutriScoreStyle =
    nutriGrade === "A"
      ? styles.nutriA
      : nutriGrade === "B"
      ? styles.nutriB
      : nutriGrade === "C"
      ? styles.nutriC
      : nutriGrade === "D"
      ? styles.nutriD
      : nutriGrade === "E"
      ? styles.nutriE
      : styles.nutriUnknown;

  return (
    <View style={styles.nutritionCard}>
      {nutriGrade ? (
        <View style={styles.nutriScoreRow}>
          <Text style={styles.nutriScoreLabel}>Nutri-Score</Text>

          <View style={[styles.nutriGradeBadge, nutriScoreStyle]}>
            <Text style={styles.nutriGradeText}>{nutriGrade}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.nutritionCaption}>Per 100 g</Text>

      <View style={styles.nutritionGrid}>
        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionItemLabel}>Energy</Text>
          <Text style={styles.nutritionItemValue}>
            {kcal === null ? "Not available" : `${kcal} kcal`}
          </Text>
        </View>

        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionItemLabel}>Sugar</Text>
          <Text style={styles.nutritionItemValue}>
            {formatNutritionValue(
              nutriments?.sugars_100g,
              "g"
            )}
          </Text>
        </View>

        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionItemLabel}>
            Saturated fat
          </Text>
          <Text style={styles.nutritionItemValue}>
            {formatNutritionValue(
              nutriments?.["saturated-fat_100g"],
              "g"
            )}
          </Text>
        </View>

        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionItemLabel}>Salt</Text>
          <Text style={styles.nutritionItemValue}>
            {formatNutritionValue(
              nutriments?.salt_100g,
              "g"
            )}
          </Text>
        </View>
      </View>

      <Text style={styles.nutritionDisclaimer}>
        Nutrition information is supplied by the product database and is
        shown for comparison only. Check the packaging for current values.
      </Text>
    </View>
  );
}

function StatusCard({
  title,
  result,
}: {
  title: string;
  result: StatusResult;
}) {
  const isSuitable = result.kind === "good";

  return (
    <View
      style={[
        styles.statusCard,
        isSuitable ? styles.statusGood : styles.statusDanger,
      ]}
    >
      <View style={styles.statusTopRow}>
        <Text
          style={[
            styles.statusTitle,
            isSuitable
              ? styles.statusTitleGood
              : styles.statusTitleDanger,
          ]}
        >
          {title}
        </Text>

        <View
          style={[
            styles.statusBadge,
            isSuitable
              ? styles.statusBadgeGood
              : styles.statusBadgeDanger,
          ]}
        >
          <Text style={styles.statusBadgeText}>
            {isSuitable ? "✓" : "!"}
          </Text>
        </View>
      </View>

      <Text
        style={[
          styles.statusLabel,
          isSuitable
            ? styles.statusTitleGood
            : styles.statusTitleDanger,
        ]}
      >
        {result.label}
      </Text>

      <Text
        style={[
          styles.statusExplanation,
          isSuitable
            ? styles.statusExplanationGood
            : styles.statusExplanationDanger,
        ]}
      >
        Why this result: {result.explanation}
      </Text>
    </View>
  );
}

export default function App() {
  const [searchMode, setSearchMode] = useState<SearchMode>("barcode");
  const [barcode, setBarcode] = useState("");
  const [productNameQuery, setProductNameQuery] = useState("");
  const [manualSearchVisible, setManualSearchVisible] =
    useState(false);

  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);

  const [favourites, setFavourites] = useState<Product[]>([]);
  const [favouritesLoaded, setFavouritesLoaded] = useState(false);

  const [preferences, setPreferences] = useState<Preferences>(
    defaultPreferences
  );

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    loadFavourites();
    loadPreferences();
  }, []);

  async function loadFavourites() {
    try {
      const savedFavourites = await AsyncStorage.getItem(
        FAVOURITES_STORAGE_KEY
      );

      if (savedFavourites) {
        setFavourites(JSON.parse(savedFavourites));
      }
    } catch {
      setError("Unable to load saved favourites.");
    } finally {
      setFavouritesLoaded(true);
    }
  }

  async function saveFavourites(updatedFavourites: Product[]) {
    try {
      await AsyncStorage.setItem(
        FAVOURITES_STORAGE_KEY,
        JSON.stringify(updatedFavourites)
      );

      setFavourites(updatedFavourites);
    } catch {
      setError("Unable to save favourites on this device.");
    }
  }

  async function loadPreferences() {
    try {
      const savedPreferences = await AsyncStorage.getItem(
        PREFERENCES_STORAGE_KEY
      );

      if (savedPreferences) {
        setPreferences({
          ...defaultPreferences,
          ...JSON.parse(savedPreferences),
        });
      }
    } catch {
      setError("Unable to load saved preferences.");
    }
  }

  async function updatePreference(
    preferenceName: keyof Preferences,
    value: boolean
  ) {
    const updatedPreferences = {
      ...preferences,
      [preferenceName]: value,
    };

    setPreferences(updatedPreferences);

    try {
      await AsyncStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(updatedPreferences)
      );
    } catch {
      setError("Unable to save preferences on this device.");
    }
  }

  function isFavourite(productToCheck: Product | null): boolean {
    if (!productToCheck?.code) {
      return false;
    }

    return favourites.some(
      (favourite) => favourite.code === productToCheck.code
    );
  }

  async function addFavourite() {
    if (!product?.code) {
      return;
    }

    if (isFavourite(product)) {
      setSuccessMessage("This product is already in favourites.");
      return;
    }

    const updatedFavourites = [product, ...favourites];

    await saveFavourites(updatedFavourites);
    setSuccessMessage("Product saved to favourites.");
  }

  async function removeFavourite(barcodeToRemove: string | undefined) {
    if (!barcodeToRemove) {
      return;
    }

    const updatedFavourites = favourites.filter(
      (favourite) => favourite.code !== barcodeToRemove
    );

    await saveFavourites(updatedFavourites);
    setSuccessMessage("Product removed from favourites.");
  }

  async function openProduct(selectedProduct: Product) {
    if (!selectedProduct.code) {
      setProduct(selectedProduct);
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    setSearchResults([]);

    try {
      const response = await fetch(
        `${PRODUCT_API_URL}/${selectedProduct.code}.json`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load full product details.");
      }

      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        setProduct(selectedProduct);
        setBarcode(selectedProduct.code);
        return;
      }

      setProduct(data.product);
      setBarcode(selectedProduct.code);
      setManualSearchVisible(false);
    } catch {
      setProduct(selectedProduct);
      setBarcode(selectedProduct.code);
      setError(
        "Only basic search information loaded. Use barcode search for full details."
      );
    } finally {
      setLoading(false);
    }
  }

  function openFavourite(favourite: Product) {
    openProduct(favourite);
  }

  async function searchProduct(barcodeToSearch = barcode) {
    const cleanBarcode = barcodeToSearch.trim();

    if (!cleanBarcode) {
      setError("Please enter or scan a barcode.");
      setProduct(null);
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    setProduct(null);
    setSearchResults([]);

    try {
      const response = await fetch(
        `${PRODUCT_API_URL}/${cleanBarcode}.json`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Food database returned status ${response.status}.`
        );
      }

      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        setError(
          "This barcode was scanned, but the product was not found."
        );
        return;
      }

      setProduct(data.product);
      setManualSearchVisible(false);
    } catch {
      setProduct(null);
      setError(
        "Unable to load this product. Check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchProductsByName() {
    const cleanQuery = productNameQuery.trim().toLowerCase();

    if (!cleanQuery) {
      setError("Please enter a product name.");
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    setProduct(null);
    setSearchResults([]);

    const localMatches = STARTER_PRODUCTS.filter((item) => {
      const name = (item.product_name || "").toLowerCase();
      const brand = (item.brands || "").toLowerCase();

      return (
        name.includes(cleanQuery) ||
        brand.includes(cleanQuery)
      );
    });

    if (localMatches.length > 0) {
      setSearchResults(localMatches);
      setLoading(false);
      return;
    }

    setLoading(false);
    setError(
      "Product name search is currently available for Nutella, Toblerone, Oreo, Coca-Cola and Cadbury Dairy Milk. For other products, use barcode search or camera scanning."
    );
  }

  function changeSearchMode(mode: SearchMode) {
    setSearchMode(mode);
    setManualSearchVisible(true);
    setError("");
    setSuccessMessage("");
    setProduct(null);
    setSearchResults([]);
  }

  async function openScanner() {
    if (!permission) {
      return;
    }

    if (!permission.granted) {
      const permissionResult = await requestPermission();

      if (!permissionResult.granted) {
        setError(
          "Camera permission is needed to scan a product barcode."
        );
        return;
      }
    }

    setError("");
    setSuccessMessage("");
    setScanned(false);
    setScannerVisible(true);
  }

  function handleBarcodeScanned(result: BarcodeResult) {
    if (scanned) {
      return;
    }

    const scannedCode = result.data;

    if (!scannedCode || !/^\d+$/.test(scannedCode)) {
      setError(
        "This does not look like a product barcode. Try again."
      );
      return;
    }

    setScanned(true);
    setScannerVisible(false);
    setBarcode(scannedCode);
    setSearchMode("barcode");
    searchProduct(scannedCode);
  }

  const ingredients = product ? getIngredients(product) : "";

  const veganResult = product
    ? getStrictDecision(
        product,
        veganProhibitedWords,
        "vegan"
      )
    : null;

  const vegetarianResult = product
    ? getStrictDecision(
        product,
        vegetarianProhibitedWords,
        "vegetarian"
      )
    : null;

  const halalResult = product
    ? getStrictHalalDecision(product)
    : null;

  const allergyWarnings = product
    ? getAllergyWarnings(product, preferences)
    : [];

  const activeAllergies = allergyChecks
    .filter((allergy) => preferences[allergy.preference])
    .map((allergy) => allergy.title);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>🥗 FoodFriend</Text>

            <Text style={styles.subtitle}>
              Make confident choices before you buy.
            </Text>
          </View>

          <Pressable
            style={styles.settingsButton}
            onPress={() => setPreferencesVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open FoodFriend settings"
          >
            <Text style={styles.settingsButtonText}>⚙️</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIconCircle}>
            <Text style={styles.heroIcon}>🛒</Text>
          </View>

          <Text style={styles.heroTitle}>Know before you buy.</Text>

          <Text style={styles.heroDescription}>
            Scan packaged food to check it against your chosen dietary
            preferences.
          </Text>

          <Pressable
            style={styles.primaryScanButton}
            onPress={openScanner}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Scan a food product barcode with camera"
          >
            <Text style={styles.primaryScanIcon}>📷</Text>

            <View style={styles.primaryScanTextContainer}>
              <Text style={styles.primaryScanTitle}>
                Scan a product
              </Text>

              <Text style={styles.primaryScanSubtitle}>
                Check before you buy
              </Text>
            </View>

            <Text style={styles.primaryScanArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.quickActionRow}>
          <Pressable
            style={styles.quickActionButtonLeft}
            onPress={() => changeSearchMode("barcode")}
            accessibilityRole="button"
            accessibilityLabel="Enter a product barcode manually"
          >
            <Text style={styles.quickActionIcon}>⌨️</Text>
            <Text style={styles.quickActionText}>Enter barcode</Text>
          </Pressable>

          <Pressable
            style={styles.quickActionButtonRight}
            onPress={() => changeSearchMode("name")}
            accessibilityRole="button"
            accessibilityLabel="Search for a product by name"
          >
            <Text style={styles.quickActionIcon}>🔎</Text>
            <Text style={styles.quickActionText}>Search by name</Text>
          </Pressable>
        </View>

        <View style={styles.activeChecksCard}>
          <View style={styles.activeChecksHeader}>
            <Text style={styles.activeChecksTitle}>
              Your active checks
            </Text>

            <Pressable
              onPress={() => setPreferencesVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit dietary and allergy preferences"
            >
              <Text style={styles.editChecksText}>Edit</Text>
            </Pressable>
          </View>

          <View style={styles.checkPillRow}>
            {preferences.showVegan ? (
              <View style={styles.checkPill}>
                <Text style={styles.checkPillText}>Vegan</Text>
              </View>
            ) : null}

            {preferences.showVegetarian ? (
              <View style={styles.checkPill}>
                <Text style={styles.checkPillText}>Vegetarian</Text>
              </View>
            ) : null}

            {preferences.showHalal ? (
              <View style={styles.checkPill}>
                <Text style={styles.checkPillText}>
                  Halal-friendly
                </Text>
              </View>
            ) : null}

            {activeAllergies.map((allergy) => (
              <View style={styles.allergyPill} key={allergy}>
                <Text style={styles.allergyPillText}>
                  ⚠️ {allergy}
                </Text>
              </View>
            ))}

            {!preferences.showVegan &&
            !preferences.showVegetarian &&
            !preferences.showHalal &&
            activeAllergies.length === 0 ? (
              <Text style={styles.noChecksText}>
                No checks selected. Tap Edit to choose preferences.
              </Text>
            ) : null}
          </View>
        </View>

        {manualSearchVisible ? (
          <View style={styles.manualSearchCard}>
            <View style={styles.manualSearchHeader}>
              <Text style={styles.manualSearchTitle}>Manual search</Text>

              <Pressable
                onPress={() => {
                  setManualSearchVisible(false);
                  setError("");
                  setSearchResults([]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close manual search"
              >
                <Text style={styles.closeManualSearchText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.searchModeRow}>
              <Pressable
                style={[
                  styles.searchModeButton,
                  searchMode === "barcode"
                    ? styles.searchModeButtonActive
                    : styles.searchModeButtonInactive,
                ]}
                onPress={() => setSearchMode("barcode")}
              >
                <Text
                  style={[
                    styles.searchModeText,
                    searchMode === "barcode"
                      ? styles.searchModeTextActive
                      : styles.searchModeTextInactive,
                  ]}
                >
                  Barcode
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.searchModeButton,
                  searchMode === "name"
                    ? styles.searchModeButtonActive
                    : styles.searchModeButtonInactive,
                ]}
                onPress={() => setSearchMode("name")}
              >
                <Text
                  style={[
                    styles.searchModeText,
                    searchMode === "name"
                      ? styles.searchModeTextActive
                      : styles.searchModeTextInactive,
                  ]}
                >
                  Product name
                </Text>
              </Pressable>
            </View>

            {searchMode === "barcode" ? (
              <>
                <Text style={styles.label}>Enter a barcode</Text>

                <TextInput
                  style={styles.input}
                  value={barcode}
                  onChangeText={setBarcode}
                  placeholder="Example: 3017620422003"
                  keyboardType="number-pad"
                  returnKeyType="search"
                  onSubmitEditing={() => searchProduct()}
                />

                <Pressable
                  style={styles.searchButton}
                  onPress={() => searchProduct()}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Search product by barcode"
                >
                  <Text style={styles.searchButtonText}>
                    {loading ? "Searching..." : "Search product"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Search by product name</Text>

                <TextInput
                  style={styles.input}
                  value={productNameQuery}
                  onChangeText={setProductNameQuery}
                  placeholder="Try Nutella, Toblerone, Oreo or Cadbury"
                  returnKeyType="search"
                  onSubmitEditing={searchProductsByName}
                />

                <Pressable
                  style={styles.searchButton}
                  onPress={searchProductsByName}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Search products by name"
                >
                  <Text style={styles.searchButtonText}>
                    {loading ? "Searching..." : "Search products"}
                  </Text>
                </Pressable>

                <Text style={styles.searchHint}>
                  Barcode scanning is the most accurate option.
                </Text>
              </>
            )}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator
            size="large"
            color="#1F5A3A"
            style={styles.loader}
          />
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {searchResults.length > 0 ? (
          <View style={styles.searchResultsSection}>
            <Text style={styles.sectionTitle}>Search results</Text>

            <Text style={styles.searchResultCount}>
              {searchResults.length} product
              {searchResults.length === 1 ? "" : "s"} found
            </Text>

            {searchResults.map((searchResult) => (
              <View
                style={styles.searchResultItem}
                key={searchResult.code}
              >
                <View style={styles.searchImagePlaceholder}>
                  <Text style={styles.searchImagePlaceholderText}>
                    🥗
                  </Text>
                </View>

                <View style={styles.searchResultDetails}>
                  <Text
                    style={styles.searchResultName}
                    numberOfLines={2}
                  >
                    {searchResult.product_name || "Unnamed product"}
                  </Text>

                  <Text
                    style={styles.searchResultBrand}
                    numberOfLines={1}
                  >
                    {searchResult.brands || "Brand unavailable"}
                  </Text>

                  <Text
                    style={styles.searchResultBarcode}
                    numberOfLines={1}
                  >
                    Barcode: {searchResult.code}
                  </Text>

                  <Pressable
                    style={styles.viewResultButton}
                    onPress={() => openProduct(searchResult)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${searchResult.product_name}`}
                  >
                    <Text style={styles.viewResultButtonText}>
                      View product
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {product ? (
          <View style={styles.productCard}>
            <Text style={styles.productName}>
              {product.product_name || "Product name unavailable"}
            </Text>

            <Text style={styles.productInfo}>
              Brand: {product.brands || "Unavailable"}
            </Text>

            <Text style={styles.productInfo}>
              Barcode: {product.code || barcode}
            </Text>

            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="contain"
              />
            ) : null}

            <Pressable
              style={
                isFavourite(product)
                  ? styles.savedButton
                  : styles.favouriteButton
              }
              onPress={() => {
                if (isFavourite(product)) {
                  removeFavourite(product.code);
                } else {
                  addFavourite();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={
                isFavourite(product)
                  ? "Remove product from favourites"
                  : "Save product to favourites"
              }
            >
              <Text
                style={
                  isFavourite(product)
                    ? styles.savedButtonText
                    : styles.favouriteButtonText
                }
              >
                {isFavourite(product)
                  ? "★ Remove from favourites"
                  : "☆ Save to favourites"}
              </Text>
            </Pressable>

            {allergyWarnings.length > 0 ? (
              <View style={styles.allergyWarningBox}>
                <Text style={styles.allergyWarningTitle}>
                  ⚠️ Allergy warning
                </Text>

                <Text style={styles.allergyWarningText}>
                  Possible selected-allergy matches were found:
                </Text>

                {allergyWarnings.map((warning) => (
                  <Text
                    style={styles.allergyWarningItem}
                    key={warning}
                  >
                    • {warning}
                  </Text>
                ))}

                <Text style={styles.allergyDisclaimerText}>
                  Always check the physical packaging and manufacturer
                  allergen advice before consuming.
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>
              Dietary information
            </Text>

            {preferences.showVegan && veganResult ? (
              <StatusCard title="Vegan" result={veganResult} />
            ) : null}

            {preferences.showVegetarian && vegetarianResult ? (
              <StatusCard
                title="Vegetarian"
                result={vegetarianResult}
              />
            ) : null}

            {preferences.showHalal && halalResult ? (
              <StatusCard
                title="Halal-friendly"
                result={halalResult}
              />
            ) : null}

            <Text style={styles.sectionTitle}>
              Nutrition at a glance
            </Text>

            <NutritionCard product={product} />

            <Text style={styles.sectionTitle}>Ingredients</Text>

            <Text style={styles.bodyText}>
              {ingredients || "Ingredients unavailable."}
            </Text>

            <Text style={styles.sectionTitle}>Labels</Text>

            <Text style={styles.bodyText}>
              {product.labels || "No labels available."}
            </Text>

            <Text style={styles.sectionTitle}>Allergens</Text>

            <Text style={styles.bodyText}>
              {product.allergens || "No allergens listed."}
            </Text>

            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                FoodFriend uses a strict rule-based ingredient check. It
                cannot replace physical packaging, allergy advice, or halal
                certification.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.favouritesSection}>
          <Text style={styles.sectionTitle}>★ Saved favourites</Text>

          {!favouritesLoaded ? (
            <ActivityIndicator
              size="small"
              color="#1F5A3A"
              style={styles.favouritesLoader}
            />
          ) : null}

          {favouritesLoaded && favourites.length === 0 ? (
            <Text style={styles.emptyText}>
              No saved products yet. Search for a product, then tap
              “Save to favourites”.
            </Text>
          ) : null}

          {favourites.map((favourite) => (
            <View
              style={styles.favouriteItem}
              key={favourite.code || favourite.product_name}
            >
              {favourite.image_url ? (
                <Image
                  source={{ uri: favourite.image_url }}
                  style={styles.favouriteImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderText}>🥗</Text>
                </View>
              )}

              <View style={styles.favouriteDetails}>
                <Text style={styles.favouriteName} numberOfLines={2}>
                  {favourite.product_name || "Unnamed product"}
                </Text>

                <Text style={styles.favouriteBrand} numberOfLines={1}>
                  {favourite.brands || "Brand unavailable"}
                </Text>

                <View style={styles.favouriteButtons}>
                  <Pressable
                    style={styles.viewButton}
                    onPress={() => openFavourite(favourite)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${favourite.product_name}`}
                  >
                    <Text style={styles.viewButtonText}>View</Text>
                  </Pressable>

                  <Pressable
                    style={styles.removeButton}
                    onPress={() => removeFavourite(favourite.code)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${favourite.product_name} from favourites`}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>

        <Modal
          visible={preferencesVisible}
          animationType="slide"
          onRequestClose={() => setPreferencesVisible(false)}
        >
          <SafeAreaView style={styles.preferencesScreen}>
            <ScrollView
              contentContainerStyle={styles.preferencesContent}
            >
              <View style={styles.preferencesHeader}>
                <Text style={styles.preferencesTitle}>Preferences</Text>

                <Pressable
                  style={styles.closeButton}
                  onPress={() => setPreferencesVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close preferences"
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </Pressable>
              </View>

              <Text style={styles.preferencesDescription}>
                Choose the dietary and allergy checks FoodFriend should
                show for each product.
              </Text>

              <Text style={styles.preferencesSectionTitle}>
                Dietary preferences
              </Text>

              <View style={styles.preferenceRow}>
                <View style={styles.preferenceText}>
                  <Text style={styles.preferenceTitle}>Vegan</Text>
                  <Text style={styles.preferenceDescription}>
                    Highlight animal-derived ingredients.
                  </Text>
                </View>

                <Switch
                  value={preferences.showVegan}
                  onValueChange={(value) =>
                    updatePreference("showVegan", value)
                  }
                  trackColor={{
                    false: "#C8D0C8",
                    true: "#78D68B",
                  }}
                  thumbColor={
                    preferences.showVegan ? "#1F5A3A" : "#F4F4F5"
                  }
                />
              </View>

              <View style={styles.preferenceRow}>
                <View style={styles.preferenceText}>
                  <Text style={styles.preferenceTitle}>
                    Vegetarian
                  </Text>
                  <Text style={styles.preferenceDescription}>
                    Highlight meat, fish, lard and gelatin concerns.
                  </Text>
                </View>

                <Switch
                  value={preferences.showVegetarian}
                  onValueChange={(value) =>
                    updatePreference("showVegetarian", value)
                  }
                  trackColor={{
                    false: "#C8D0C8",
                    true: "#78D68B",
                  }}
                  thumbColor={
                    preferences.showVegetarian
                      ? "#1F5A3A"
                      : "#F4F4F5"
                  }
                />
              </View>

              <View style={styles.preferenceRow}>
                <View style={styles.preferenceText}>
                  <Text style={styles.preferenceTitle}>
                    Halal-friendly
                  </Text>
                  <Text style={styles.preferenceDescription}>
                    Checks for detected pork and alcohol-related terms.
                  </Text>
                </View>

                <Switch
                  value={preferences.showHalal}
                  onValueChange={(value) =>
                    updatePreference("showHalal", value)
                  }
                  trackColor={{
                    false: "#C8D0C8",
                    true: "#78D68B",
                  }}
                  thumbColor={
                    preferences.showHalal ? "#1F5A3A" : "#F4F4F5"
                  }
                />
              </View>

              <Text style={styles.preferencesSectionTitle}>
                Allergy checks
              </Text>

              {allergyChecks.map((allergy) => (
                <View
                  style={styles.preferenceRow}
                  key={allergy.preference}
                >
                  <View style={styles.preferenceText}>
                    <Text style={styles.preferenceTitle}>
                      {allergy.title}
                    </Text>

                    <Text style={styles.preferenceDescription}>
                      Show a warning when ingredients or allergen information
                      suggests a match.
                    </Text>
                  </View>

                  <Switch
                    value={preferences[allergy.preference]}
                    onValueChange={(value) =>
                      updatePreference(allergy.preference, value)
                    }
                    trackColor={{
                      false: "#C8D0C8",
                      true: "#F59E0B",
                    }}
                    thumbColor={
                      preferences[allergy.preference]
                        ? "#92400E"
                        : "#F4F4F5"
                    }
                  />
                </View>
              ))}

              <View style={styles.disclaimerBox}>
                <Text style={styles.disclaimerText}>
                  Allergy warnings are informational only. Always read the
                  product label and manufacturer advice.
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={scannerVisible}
          animationType="slide"
          onRequestClose={() => setScannerVisible(false)}
        >
          <SafeAreaView style={styles.scannerScreen}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Scan a barcode</Text>

              <Pressable
                style={styles.closeButton}
                onPress={() => setScannerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close barcode scanner"
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.scannerHelp}>
              Point the camera at the product barcode.
            </Text>

            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={
                  scanned ? undefined : handleBarcodeScanned
                }
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "ean13",
                    "ean8",
                    "upc_a",
                    "upc_e",
                    "code128",
                  ],
                }}
              />

              <View style={styles.scanFrame} />
            </View>

            <Text style={styles.scannerTip}>
              Keep the barcode inside the green frame and hold your phone
              steady.
            </Text>
          </SafeAreaView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F8F3",
  },
  container: {
    padding: 20,
    paddingBottom: 42,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 16,
    marginBottom: 18,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1F5A3A",
    marginBottom: 7,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#475569",
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8F5EC",
    borderWidth: 1,
    borderColor: "#CDE8D4",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsButtonText: {
    fontSize: 23,
  },
  heroCard: {
    backgroundColor: "#1F5A3A",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
  },
  heroIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroIcon: {
    fontSize: 28,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroDescription: {
    color: "#E8F5EC",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  primaryScanButton: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  primaryScanIcon: {
    fontSize: 27,
    marginRight: 12,
  },
  primaryScanTextContainer: {
    flex: 1,
  },
  primaryScanTitle: {
    color: "#1F5A3A",
    fontSize: 18,
    fontWeight: "800",
  },
  primaryScanSubtitle: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 3,
  },
  primaryScanArrow: {
    color: "#1F5A3A",
    fontSize: 32,
    fontWeight: "400",
  },
  quickActionRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  quickActionButtonLeft: {
    flex: 1,
    minHeight: 82,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
    marginRight: 6,
  },
  quickActionButtonRight: {
    flex: 1,
    minHeight: 82,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
    marginLeft: 6,
  },
  quickActionIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  quickActionText: {
    color: "#1F2937",
    fontSize: 14,
    fontWeight: "700",
  },
  activeChecksCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeChecksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  activeChecksTitle: {
    color: "#1F2937",
    fontSize: 17,
    fontWeight: "800",
  },
  editChecksText: {
    color: "#1F5A3A",
    fontSize: 14,
    fontWeight: "800",
  },
  checkPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  checkPill: {
    backgroundColor: "#E8F5EC",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  checkPillText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
  },
  allergyPill: {
    backgroundColor: "#FFF7DD",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  allergyPillText: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "700",
  },
  noChecksText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  manualSearchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  manualSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  manualSearchTitle: {
    color: "#1F2937",
    fontSize: 18,
    fontWeight: "800",
  },
  closeManualSearchText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },
  searchModeRow: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  searchModeButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 9,
  },
  searchModeButtonActive: {
    backgroundColor: "#1F5A3A",
  },
  searchModeButtonInactive: {
    backgroundColor: "transparent",
  },
  searchModeText: {
    fontSize: 15,
    fontWeight: "800",
  },
  searchModeTextActive: {
    color: "#FFFFFF",
  },
  searchModeTextInactive: {
    color: "#555555",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F5A3A",
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  searchButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#1F5A3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  searchHint: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  loader: {
    marginVertical: 20,
  },
  errorBox: {
    backgroundColor: "#FDEBEC",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorText: {
    color: "#991B1B",
    fontSize: 15,
    lineHeight: 22,
  },
  successBox: {
    backgroundColor: "#DCFCE7",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  successText: {
    color: "#166534",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  searchResultsSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchResultCount: {
    color: "#64748B",
    fontSize: 14,
    marginBottom: 4,
  },
  searchResultItem: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
    marginTop: 12,
  },
  searchImagePlaceholder: {
    width: 86,
    height: 86,
    borderRadius: 12,
    backgroundColor: "#EEF5EE",
    justifyContent: "center",
    alignItems: "center",
  },
  searchImagePlaceholderText: {
    fontSize: 32,
  },
  searchResultDetails: {
    flex: 1,
    marginLeft: 12,
  },
  searchResultName: {
    color: "#1F5A3A",
    fontSize: 16,
    fontWeight: "800",
  },
  searchResultBrand: {
    color: "#64748B",
    fontSize: 14,
    marginTop: 3,
  },
  searchResultBarcode: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },
  viewResultButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1F5A3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 9,
  },
  viewResultButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  productCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  productName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1F5A3A",
    marginBottom: 8,
  },
  productInfo: {
    fontSize: 15,
    color: "#64748B",
    marginBottom: 4,
  },
  productImage: {
    width: "100%",
    height: 220,
    marginVertical: 16,
  },
  favouriteButton: {
    backgroundColor: "#1F5A3A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  favouriteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  savedButton: {
    backgroundColor: "#E8F5EC",
    borderColor: "#1F5A3A",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  savedButtonText: {
    color: "#1F5A3A",
    fontSize: 16,
    fontWeight: "800",
  },
  allergyWarningBox: {
    backgroundColor: "#FFF7DD",
    borderLeftWidth: 5,
    borderLeftColor: "#F59E0B",
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
  },
  allergyWarningTitle: {
    color: "#92400E",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  allergyWarningText: {
    color: "#78350F",
    fontSize: 14,
    lineHeight: 20,
  },
  allergyWarningItem: {
    color: "#78350F",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  allergyDisclaimerText: {
    color: "#78350F",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    fontStyle: "italic",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1F5A3A",
    marginTop: 18,
    marginBottom: 10,
  },
  statusCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  statusGood: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  statusDanger: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  statusTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusTitleGood: {
    color: "#166534",
  },
  statusTitleDanger: {
    color: "#991B1B",
  },
  statusBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  statusBadgeGood: {
    backgroundColor: "#22C55E",
  },
  statusBadgeDanger: {
    backgroundColor: "#EF4444",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 5,
  },
  statusExplanation: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusExplanationGood: {
    color: "#166534",
  },
  statusExplanationDanger: {
    color: "#7F1D1D",
  },
  nutritionCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#D9E3DA",
    borderRadius: 14,
    padding: 14,
  },
  nutritionUnavailable: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#D9E3DA",
    borderRadius: 14,
    padding: 14,
  },
  nutritionUnavailableText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  nutriScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  nutriScoreLabel: {
    color: "#1F5A3A",
    fontSize: 17,
    fontWeight: "800",
  },
  nutriGradeBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  nutriGradeText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  nutriA: {
    backgroundColor: "#038141",
  },
  nutriB: {
    backgroundColor: "#85BB2F",
  },
  nutriC: {
    backgroundColor: "#FECB02",
  },
  nutriD: {
    backgroundColor: "#EE8100",
  },
  nutriE: {
    backgroundColor: "#E63E11",
  },
  nutriUnknown: {
    backgroundColor: "#6B7280",
  },
  nutritionCaption: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 10,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  nutritionItem: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  nutritionItemLabel: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 4,
  },
  nutritionItemValue: {
    color: "#1F5A3A",
    fontSize: 16,
    fontWeight: "800",
  },
  nutritionDisclaimer: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 23,
    color: "#334155",
  },
  disclaimerBox: {
    backgroundColor: "#FFF7DD",
    borderRadius: 12,
    padding: 14,
    marginTop: 22,
  },
  disclaimerText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#78350F",
  },
  favouritesSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  favouritesLoader: {
    marginVertical: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
    lineHeight: 22,
  },
  favouriteItem: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
    marginTop: 12,
  },
  favouriteImage: {
    width: 78,
    height: 78,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  imagePlaceholder: {
    width: 78,
    height: 78,
    borderRadius: 12,
    backgroundColor: "#EEF5EE",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 30,
  },
  favouriteDetails: {
    flex: 1,
    marginLeft: 12,
  },
  favouriteName: {
    color: "#1F5A3A",
    fontSize: 16,
    fontWeight: "800",
  },
  favouriteBrand: {
    color: "#64748B",
    fontSize: 14,
    marginTop: 3,
  },
  favouriteButtons: {
    flexDirection: "row",
    marginTop: 10,
  },
  viewButton: {
    backgroundColor: "#1F5A3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  viewButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  removeButton: {
    backgroundColor: "#FDEBEC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "700",
  },
  preferencesScreen: {
    flex: 1,
    backgroundColor: "#F8F8F3",
  },
  preferencesContent: {
    padding: 20,
    paddingBottom: 40,
  },
  preferencesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 16,
  },
  preferencesTitle: {
    color: "#1F5A3A",
    fontSize: 28,
    fontWeight: "800",
  },
  preferencesSectionTitle: {
    color: "#1F5A3A",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
  },
  preferencesDescription: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  preferenceText: {
    flex: 1,
    paddingRight: 14,
  },
  preferenceTitle: {
    color: "#1F5A3A",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  preferenceDescription: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 20,
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 12,
  },
  scannerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  closeButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeButtonText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
  scannerHelp: {
    color: "#D1D5DB",
    fontSize: 16,
    marginBottom: 20,
  },
  cameraContainer: {
    height: 440,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  scanFrame: {
    position: "absolute",
    top: "30%",
    left: "12%",
    width: "76%",
    aspectRatio: 1.7,
    borderWidth: 3,
    borderColor: "#78D68B",
    borderRadius: 14,
  },
  scannerTip: {
    color: "#D1D5DB",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 22,
  },
});