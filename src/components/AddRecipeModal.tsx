import React, { useState } from 'react';
import type { Recipe, RecipeSourceType, Ingredient, InstructionStep } from '../types/recipe';
import { parseRecipeFromHtml, parseRawRecipeText, fetchInstagramRecipeFromUrl } from '../services/recipeParser';
import { processCookbookImage, type OcrProgress } from '../services/ocrService';
import {
  X, Globe, BookOpen, PenTool, Sparkles,
  Camera, Loader2, Bookmark, ExternalLink
} from 'lucide-react';
import { InstagramIcon } from './Icons';

interface AddRecipeModalProps {
  initialRecipe?: Recipe;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}

type IntakeTab = 'website' | 'instagram' | 'cookbook' | 'manual';

export const AddRecipeModal: React.FC<AddRecipeModalProps> = ({
  initialRecipe,
  onSave,
  onClose
}) => {
  const getInitialTab = (): IntakeTab => {
    if (!initialRecipe) return 'website';
    if (initialRecipe.sourceType === 'family' || initialRecipe.sourceType === 'manual') return 'manual';
    return initialRecipe.sourceType as IntakeTab;
  };

  const [activeTab, setActiveTab] = useState<IntakeTab>(getInitialTab());

  // Intake State
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  
  // Instagram Intake State
  const [instagramUrl, setInstagramUrl] = useState('');
  const [isPullingInstagram, setIsPullingInstagram] = useState(false);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [showManualCaptionFallback, setShowManualCaptionFallback] = useState(false);

  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');

  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);

  // Form State
  const [title, setTitle] = useState(initialRecipe?.title || '');
  const [description, setDescription] = useState(initialRecipe?.description || '');
  const [sourceType, setSourceType] = useState<RecipeSourceType>(initialRecipe?.sourceType || 'website');
  const [sourceName, setSourceName] = useState(initialRecipe?.sourceName || '');
  const [sourceUrl, setSourceUrl] = useState(initialRecipe?.sourceUrl || '');
  const [coverImage, setCoverImage] = useState(initialRecipe?.coverImage || '');
  const [servings, setServings] = useState(initialRecipe?.servings || 4);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number | undefined>(initialRecipe?.prepTimeMinutes);
  const [cookTimeMinutes, setCookTimeMinutes] = useState<number | undefined>(initialRecipe?.cookTimeMinutes);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Advanced'>(initialRecipe?.difficulty || 'Easy');
  const [categoriesInput, setCategoriesInput] = useState(initialRecipe?.categories?.join(', ') || 'Dinners');
  const [tagsInput, setTagsInput] = useState(initialRecipe?.tags?.join(', ') || '');
  const [wantToTry, setWantToTry] = useState<boolean>(initialRecipe ? (initialRecipe.wantToTry ?? false) : true);
  
  const [ingredientsText, setIngredientsText] = useState(
    initialRecipe?.ingredients?.map(i => i.raw).join('\n') || ''
  );
  const [instructionsText, setInstructionsText] = useState(
    initialRecipe?.instructions?.map(i => i.text).join('\n') || ''
  );

  const [initialJasmineNote, setInitialJasmineNote] = useState('');
  const [cookbookPhotoPreview, setCookbookPhotoPreview] = useState<string | null>(null);

  // Apply parsed recipe to form
  const applyParsedRecipe = (parsed: Partial<Recipe>) => {
    if (parsed.title) setTitle(parsed.title);
    if (parsed.description) setDescription(parsed.description);
    if (parsed.sourceName) setSourceName(parsed.sourceName);
    if (parsed.sourceUrl) setSourceUrl(parsed.sourceUrl);
    if (parsed.coverImage) setCoverImage(parsed.coverImage);
    if (parsed.servings) setServings(parsed.servings);
    if (parsed.prepTimeMinutes) setPrepTimeMinutes(parsed.prepTimeMinutes);
    if (parsed.cookTimeMinutes) setCookTimeMinutes(parsed.cookTimeMinutes);
    if (parsed.categories && parsed.categories.length > 0) {
      setCategoriesInput(parsed.categories.join(', '));
    }
    if (parsed.tags && parsed.tags.length > 0) {
      setTagsInput(parsed.tags.join(', '));
    }
    if (parsed.ingredients && parsed.ingredients.length > 0) {
      setIngredientsText(parsed.ingredients.map(i => i.raw).join('\n'));
    }
    if (parsed.instructions && parsed.instructions.length > 0) {
      setInstructionsText(parsed.instructions.map(i => i.text).join('\n'));
    }
    setActiveTab('manual');
  };

  // 1. Web Scraper
  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    let targetUrl = urlInput.trim();
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    // Auto-detect Instagram link pasted into website tab
    if (targetUrl.includes('instagram.com')) {
      setActiveTab('instagram');
      setInstagramUrl(targetUrl);
      handlePullInstagram(targetUrl);
      return;
    }

    setIsScraping(true);
    setScrapeError('');

    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('Could not fetch URL content');
      const html = await res.text();

      const parsed = parseRecipeFromHtml(html, targetUrl);
      if (parsed) {
        setSourceType('website');
        applyParsedRecipe(parsed);
      } else {
        throw new Error('No structured recipe found on page.');
      }
    } catch {
      setScrapeError(
        'Could not auto-scrape this page (some food blogs block proxies). You can paste the recipe text in the Instagram/Text tab!'
      );
    } finally {
      setIsScraping(false);
    }
  };

  // 2. Instagram Link Puller
  const handlePullInstagram = async (urlOverride?: string) => {
    const target = (urlOverride || instagramUrl).trim();
    if (!target) return;

    setIsPullingInstagram(true);
    setInstagramError(null);
    setShowManualCaptionFallback(false);

    try {
      const result = await fetchInstagramRecipeFromUrl(target);
      if (result.success && result.recipe) {
        setSourceType('instagram');
        if (result.sourceUrl) setSourceUrl(result.sourceUrl);
        if (result.authorName) setSourceName(result.authorName);
        applyParsedRecipe(result.recipe);
      } else {
        setInstagramError(
          result.error ||
          'Instagram requires verification for this reel. Tap "Open Reel" to view and copy the caption, then paste it below!'
        );
        setShowManualCaptionFallback(true);
        if (result.sourceUrl) setSourceUrl(result.sourceUrl);
        if (result.authorName) setSourceName(result.authorName);
      }
    } catch (err: any) {
      setInstagramError(err.message || 'Could not pull Instagram recipe.');
      setShowManualCaptionFallback(true);
    } finally {
      setIsPullingInstagram(false);
    }
  };

  // 3. Instagram / Text Parser
  const handleParseText = () => {
    if (!pastedText.trim()) return;
    const parsed = parseRawRecipeText(pastedText, pastedTitle);
    setSourceType('instagram');
    if (!sourceName) setSourceName('Instagram Post');
    if (instagramUrl && !sourceUrl) setSourceUrl(instagramUrl);
    applyParsedRecipe(parsed);
  };

  // 3. Cookbook OCR
  const handleImageOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOcr(true);
    setOcrProgress({ status: 'Reading photo...', progress: 0.1 });

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCookbookPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const { parsedRecipe } = await processCookbookImage(file, (p) => {
        setOcrProgress(p);
      });
      setSourceType('cookbook');
      if (!sourceName) setSourceName('Cookbook Recipe');
      applyParsedRecipe(parsedRecipe);
    } catch (err) {
      console.error(err);
      alert('OCR failed to read text from this image. Try a clearer shot with good lighting!');
    } finally {
      setIsProcessingOcr(false);
      setOcrProgress(null);
    }
  };

  // Final Form Submission
  const handleSubmitFinal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a recipe title');
      return;
    }

    const ingredients: Ingredient[] = ingredientsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((raw, idx) => ({
        id: `ing-${Date.now()}-${idx}`,
        raw
      }));

    const instructions: InstructionStep[] = instructionsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((text, idx) => ({
        id: `step-${Date.now()}-${idx}`,
        stepNumber: idx + 1,
        text
      }));

    const categories = categoriesInput
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const tags = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t.length > 0);

    const userPhotos: string[] = initialRecipe?.userPhotos || [];
    if (cookbookPhotoPreview) {
      userPhotos.push(cookbookPhotoPreview);
    }

    const newRecipe: Recipe = {
      id: initialRecipe?.id || `recipe-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      sourceType,
      sourceName: sourceName.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      coverImage: coverImage.trim() || (cookbookPhotoPreview || undefined),
      userPhotos,
      servings: Number(servings) || 4,
      prepTimeMinutes: prepTimeMinutes ? Number(prepTimeMinutes) : undefined,
      cookTimeMinutes: cookTimeMinutes ? Number(cookTimeMinutes) : undefined,
      difficulty,
      categories: categories.length > 0 ? categories : ['Dinners'],
      tags,
      ingredients,
      instructions,
      jasmineNotes: initialRecipe?.jasmineNotes || (initialJasmineNote.trim() ? [{
        id: `note-${Date.now()}`,
        text: initialJasmineNote.trim(),
        date: new Date().toISOString().split('T')[0]
      }] : []),
      rating: initialRecipe?.rating || 0,
      favorite: initialRecipe?.favorite || false,
      wantToTry,
      createdAt: initialRecipe?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(newRecipe);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 landscape:p-2 sm:landscape:p-4 animate-in fade-in duration-200">
      
      <div className="bg-[#FDFBF7] w-full max-w-4xl min-h-screen sm:min-h-fit sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[94vh] border border-[#EFE7DE]">
        
        {/* ReciMe Header */}
        <div className="bg-white px-5 sm:px-7 py-3.5 sm:py-4 border-b border-[#EFE7DE] flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg sm:text-2xl font-bold text-[#221E1B]">
              {initialRecipe ? 'Edit Recipe' : 'Import New Recipe'}
            </h2>
            <p className="text-xs text-[#82786D] mt-0.5 font-medium">
              Save from websites, Instagram reels, or scan cookbooks
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="bg-[#F6EFE6] px-4 sm:px-6 pt-2.5 flex gap-2 border-b border-[#E8DFC9] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('website')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'website'
                ? 'bg-[#FDFBF7] text-[#FF5B26] shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF5B26]" />
            <span>Website Link</span>
          </button>

          <button
            onClick={() => setActiveTab('instagram')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'instagram'
                ? 'bg-[#FDFBF7] text-[#E1306C] shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <InstagramIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E1306C]" />
            <span>Instagram / Text</span>
          </button>

          <button
            onClick={() => setActiveTab('cookbook')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'cookbook'
                ? 'bg-[#FDFBF7] text-amber-800 shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-700" />
            <span>Cookbook Scan</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-xs sm:text-sm font-bold transition-all ml-auto cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-[#FDFBF7] text-[#221E1B] shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#4B7D50]" />
            <span>Edit Fields</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-7">
          
          {/* TAB 1: WEBSITE LINK */}
          {activeTab === 'website' && (
            <div className="space-y-4 max-w-xl mx-auto py-4 sm:py-6">
              <div className="text-center space-y-2 mb-4 sm:mb-6">
                <div className="w-12 h-12 rounded-3xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-xs">
                  <Globe className="w-6 h-6 stroke-[2.2]" />
                </div>
                <h3 className="font-serif text-lg font-bold text-[#221E1B]">
                  Paste Any Recipe Link
                </h3>
                <p className="text-xs text-[#7A7165]">
                  Supports NYT Cooking, Half Baked Harvest, Allrecipes, Sally's Baking Addiction, and thousands more.
                </p>
              </div>

              <form onSubmit={handleScrapeUrl} className="space-y-3">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.halfbakedharvest.com/..."
                  required
                  className="w-full px-4 py-3.5 rounded-2xl border border-[#E8DFC9] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20 focus:border-[#FF5B26] text-[#221E1B]"
                />

                {scrapeError && (
                  <div className="p-3.5 bg-red-50 text-red-700 text-xs rounded-2xl border border-red-200">
                    {scrapeError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isScraping || !urlInput.trim()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF5B26]/25 transition-all cursor-pointer"
                >
                  {isScraping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting Ingredients & Steps...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Import Recipe</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: INSTAGRAM LINK OR CAPTION */}
          {activeTab === 'instagram' && (
            <div className="space-y-4 max-w-xl mx-auto py-2 sm:py-4">
              <div className="text-center space-y-1.5 mb-4">
                <div className="w-12 h-12 rounded-3xl bg-pink-50 text-[#E1306C] flex items-center justify-center mx-auto shadow-xs">
                  <InstagramIcon className="w-6 h-6" />
                </div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-[#221E1B]">
                  Import from Instagram Reel or Post
                </h3>
                <p className="text-xs text-[#7A7165] max-w-md mx-auto">
                  Paste any Instagram Reel or post link below to pull the recipe directly from the caption.
                </p>
              </div>

              {/* Primary Link Input & Puller */}
              <div className="space-y-3 p-4 sm:p-5 bg-white rounded-3xl border border-[#EFE7DE] shadow-xs">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52]">
                  Instagram Reel / Post Link
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://www.instagram.com/reel/C... or p/..."
                    className="flex-1 px-4 py-3 rounded-2xl border border-[#E8DFC9] bg-[#FDFBF7] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-[#E1306C] text-[#221E1B]"
                  />
                  <button
                    type="button"
                    onClick={() => handlePullInstagram()}
                    disabled={isPullingInstagram || !instagramUrl.trim()}
                    className="py-3 px-5 rounded-2xl bg-gradient-to-r from-[#E1306C] to-[#FF5B26] hover:opacity-95 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-pink-600/20 transition-all cursor-pointer whitespace-nowrap"
                  >
                    {isPullingInstagram ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pulling Caption...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Pull from Caption</span>
                      </>
                    )}
                  </button>
                </div>

                {instagramError && (
                  <div className="p-3.5 bg-amber-50 text-amber-900 text-xs rounded-2xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <span className="leading-relaxed">{instagramError}</span>
                    {instagramUrl && (
                      <a
                        href={instagramUrl.startsWith('http') ? instagramUrl : `https://${instagramUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-[#E1306C] hover:underline whitespace-nowrap shrink-0"
                      >
                        <span>Open Reel</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Caption Paste Accordion / Fallback */}
              <div className="p-4 sm:p-5 bg-white rounded-3xl border border-[#EFE7DE] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#221E1B]">
                      {showManualCaptionFallback ? 'Paste Caption Text:' : 'Or Paste Caption Text Manually'}
                    </span>
                    <p className="text-[11px] text-[#7A7165]">
                      Copy-paste the caption text from Instagram, TikTok, or messages
                    </p>
                  </div>
                  {!showManualCaptionFallback && (
                    <button
                      type="button"
                      onClick={() => setShowManualCaptionFallback(true)}
                      className="text-xs font-bold text-[#E1306C] hover:underline cursor-pointer"
                    >
                      Show Text Box
                    </button>
                  )}
                </div>

                {(showManualCaptionFallback || pastedText.length > 0) && (
                  <div className="space-y-3 pt-1">
                    <input
                      type="text"
                      value={pastedTitle}
                      onChange={(e) => setPastedTitle(e.target.value)}
                      placeholder="Recipe Title (optional, e.g. Spicy Rigatoni)"
                      className="w-full px-4 py-2.5 rounded-2xl border border-[#E8DFC9] bg-[#FDFBF7] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 text-[#221E1B]"
                    />

                    <textarea
                      rows={5}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={`Paste caption text here...\n\nExample:\nCreamy Garlic Pasta\nIngredients:\n1 lb pasta\n4 cloves garlic\n1/2 cup parmesan\n\nDirections:\n1. Boil pasta\n2. Sauté garlic...`}
                      className="w-full px-4 py-3 rounded-2xl border border-[#E8DFC9] bg-[#FDFBF7] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/20 leading-relaxed text-[#221E1B]"
                    />

                    <button
                      type="button"
                      onClick={handleParseText}
                      disabled={!pastedText.trim()}
                      className="w-full py-3 px-4 rounded-2xl bg-[#221E1B] hover:bg-[#38332E] disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-[#FF5B26]" />
                      <span>Organize Recipe from Pasted Text</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COOKBOOK PHOTO OCR */}
          {activeTab === 'cookbook' && (
            <div className="space-y-4 max-w-xl mx-auto py-2 sm:py-4 text-center">
              <div className="w-12 h-12 rounded-3xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto shadow-xs">
                <BookOpen className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#221E1B]">
                Scan a Cookbook Page
              </h3>
              <p className="text-xs text-[#7A7165] max-w-md mx-auto">
                Snap a clear photo of any page from your favorite cookbook or recipe card.
              </p>

              <div className="pt-2">
                <label className="inline-flex flex-col items-center justify-center w-full p-6 sm:p-8 border-2 border-dashed border-[#DFD5C7] rounded-3xl bg-white hover:bg-[#FFF8F5] cursor-pointer transition-all">
                  <Camera className="w-9 h-9 text-amber-700 mb-2" />
                  <span className="text-sm font-bold text-[#221E1B]">
                    Take Photo or Upload Image
                  </span>
                  <span className="text-xs text-[#8A8072] mt-1">
                    PNG, JPG, or HEIC
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageOcr}
                    className="hidden"
                  />
                </label>
              </div>

              {isProcessingOcr && ocrProgress && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {ocrProgress.status}
                    </span>
                    <span>{Math.round(ocrProgress.progress * 100)}%</span>
                  </div>
                  <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-600 h-full transition-all duration-300"
                      style={{ width: `${ocrProgress.progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MANUAL REVIEW & FULL EDIT */}
          {activeTab === 'manual' && (
            <form onSubmit={handleSubmitFinal} className="space-y-5">
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                    Recipe Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Buttermilk Marinated Roast Chicken"
                    className="w-full px-4 py-2.5 rounded-2xl border border-[#E8DFC9] bg-white text-sm font-bold text-[#221E1B] focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20 focus:border-[#FF5B26]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                      Source Name
                    </label>
                    <input
                      type="text"
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      placeholder="e.g. Salt Fat Acid Heat p.340"
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs text-[#221E1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                      Source Link
                    </label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs text-[#221E1B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                      Cover Image URL
                    </label>
                    <input
                      type="text"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs text-[#221E1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Quick summary..."
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs text-[#221E1B]"
                    />
                  </div>
                </div>
              </div>

              {/* Numbers Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-white rounded-3xl border border-[#EFE7DE] shadow-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A8072] mb-1">
                    Servings
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={servings}
                    onChange={(e) => setServings(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E0D5C3] text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A8072] mb-1">
                    Prep Mins
                  </label>
                  <input
                    type="number"
                    value={prepTimeMinutes || ''}
                    onChange={(e) => setPrepTimeMinutes(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="15"
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E0D5C3] text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A8072] mb-1">
                    Cook Mins
                  </label>
                  <input
                    type="number"
                    value={cookTimeMinutes || ''}
                    onChange={(e) => setCookTimeMinutes(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="30"
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E0D5C3] text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A8072] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E0D5C3] text-xs font-bold bg-white"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Categories & Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                    Categories (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={categoriesInput}
                    onChange={(e) => setCategoriesInput(e.target.value)}
                    placeholder="Dinners, Quick (<30m), Baking"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Pasta, Spicy, Date Night"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8DFC9] bg-white text-xs font-medium"
                  />
                </div>
              </div>

              {/* Ingredients & Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                    Ingredients (One per line) *
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={ingredientsText}
                    onChange={(e) => setIngredientsText(e.target.value)}
                    placeholder={`1 lb rigatoni pasta\n2 tbsp olive oil\n4 cloves garlic, minced`}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E8DFC9] bg-white text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#665D52] mb-1">
                    Instructions (One step per line) *
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={instructionsText}
                    onChange={(e) => setInstructionsText(e.target.value)}
                    placeholder={`Boil salted water and cook pasta al dente.\nSauté garlic in olive oil.\nToss pasta with sauce.`}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E8DFC9] bg-white text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20"
                  />
                </div>
              </div>

              {/* Initial Note */}
              {!initialRecipe && (
                <div className="bg-[#FFF8F5] p-3.5 rounded-2xl border border-[#FED7C7]">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#FF5B26] mb-1">
                    Jasmine's Notes / First Thoughts (Optional)
                  </label>
                  <input
                    type="text"
                    value={initialJasmineNote}
                    onChange={(e) => setInitialJasmineNote(e.target.value)}
                    placeholder="e.g. 'Found this on Instagram, try with extra garlic!'"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#EEDBCA] bg-white text-xs text-[#221E1B]"
                  />
                </div>
              )}

              {/* Want to Try Checkbox */}
              <div className="p-3.5 rounded-2xl bg-white border border-[#E8DFC9] flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#FFEFEA] text-[#FF5B26]">
                    <Bookmark className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#221E1B]">Tag as "Want to Try"</div>
                    <div className="text-[11px] text-[#7A7166]">Organize under the Want to Try bookmark list</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={wantToTry}
                  onChange={(e) => setWantToTry(e.target.checked)}
                  className="w-5 h-5 text-[#FF5B26] accent-[#FF5B26] rounded-md cursor-pointer"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#EFE7DE]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#6E6457] hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white font-bold text-xs shadow-md shadow-[#FF5B26]/25 active:scale-95 transition-all cursor-pointer"
                >
                  Save Recipe to Box
                </button>
              </div>

            </form>
          )}

        </div>

      </div>

    </div>
  );
};
