import React, { useState, useEffect } from 'react';
import { notify } from '../services/dialog';
import type { Recipe, RecipeSourceType, Ingredient, InstructionStep } from '../types/recipe';
import { parseRecipeFromHtml, parseRawRecipeText, fetchInstagramRecipeFromUrl, fetchVideoRecipeFromUrl, isVideoLink, pageTextFromHtml } from '../services/recipeParser';
import { processCookbookImages, type OcrProgress } from '../services/ocrService';
import { fileToCompressedDataUrl } from '../services/imageService';
import { fetchPageHtml } from '../services/pageFetcher';
import { refineWithAi, refineParsedRecipe } from '../services/aiClean';
import { looksLikeRecipeCode } from '../services/shareService';
import {
  X, Globe, BookOpen, PenTool, Sparkles,
  Camera, ImagePlus, Loader2, Bookmark, ExternalLink
} from 'lucide-react';

interface AddRecipeModalProps {
  initialRecipe?: Recipe;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
  /** A recipe code sent from the other person's app. Returns false when the code can't be read. */
  onPasteRecipeCode?: (text: string) => Promise<boolean>;
}

type IntakeTab = 'website' | 'cookbook' | 'manual';

export const AddRecipeModal: React.FC<AddRecipeModalProps> = ({
  initialRecipe,
  onSave,
  onClose,
  onPasteRecipeCode
}) => {
  const getInitialTab = (): IntakeTab => {
    if (!initialRecipe) return 'website';
    if (initialRecipe.sourceType === 'cookbook') return 'cookbook';
    if (initialRecipe.sourceType === 'website' || initialRecipe.sourceType === 'instagram' || initialRecipe.sourceType === 'video') return 'website';
    return 'manual';
  };

  const [activeTab, setActiveTab] = useState<IntakeTab>(getInitialTab());

  // Clipboard hint: if the last thing copied looks like a recipe link or a recipe code, offer to import it
  const [clipboardHint, setClipboardHint] = useState('');
  useEffect(() => {
    if (initialRecipe) return;
    let cancelled = false;
    (async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (cancelled || !text || text.length > 4000) return;
        const isLink = /^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text);
        if (isLink || looksLikeRecipeCode(text)) setClipboardHint(text);
      } catch {
        // The phone or browser didn't allow looking at the clipboard; that's fine, no hint then
      }
    })();
    return () => { cancelled = true; };
  }, [initialRecipe]);

  // Intake State
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  // Shown on the review form when an import came back without ingredients or steps
  const [importNotice, setImportNotice] = useState('');

  // Instagram Intake State
  const [instagramUrl, setInstagramUrl] = useState('');
  const [isPullingInstagram, setIsPullingInstagram] = useState(false);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [showManualCaptionFallback, setShowManualCaptionFallback] = useState(false);
  const [isTidyingText, setIsTidyingText] = useState(false);

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
    initialRecipe?.instructions?.map(i => i.text).join('\n\n') || ''
  );

  const [initialJasmineNote, setInitialJasmineNote] = useState('');
  // Cookbook scan: any number of page photos, plus an optional photo of the finished dish
  const [cookbookPages, setCookbookPages] = useState<Array<{ id: string; file: File; preview: string }>>([]);
  const [cookbookFood, setCookbookFood] = useState<{ file: File; preview: string } | null>(null);
  const [cookbookPageData, setCookbookPageData] = useState<string[]>([]);

  // Apply parsed recipe to form
  const applyParsedRecipe = (parsed: Partial<Recipe>) => {
    // An import replaces the whole form, so a second import never inherits the first one's leftovers
    setTitle(parsed.title || '');
    setDescription(parsed.description || '');
    setSourceName(parsed.sourceName || '');
    setSourceUrl(parsed.sourceUrl || '');
    setCoverImage(parsed.coverImage || '');
    setServings(parsed.servings || 4);
    setPrepTimeMinutes(parsed.prepTimeMinutes);
    setCookTimeMinutes(parsed.cookTimeMinutes);
    setCategoriesInput(parsed.categories && parsed.categories.length > 0 ? parsed.categories.join(', ') : 'Dinners');
    setTagsInput(parsed.tags ? parsed.tags.join(', ') : '');
    setIngredientsText((parsed.ingredients || []).map(i => i.raw).join('\n'));
    setInstructionsText((parsed.instructions || []).map(i => i.text).join('\n\n'));

    const noIngredients = !parsed.ingredients || parsed.ingredients.length === 0;
    const noSteps = !parsed.instructions || parsed.instructions.length === 0;
    if (noIngredients && noSteps) {
      setImportNotice("We found the title and photo, but couldn't find the ingredients or steps. They may be in the original post's comments or on the website. Paste them into the text box on the first tab.");
    } else if (noSteps) {
      setImportNotice("Imported! This post lists ingredients but no cooking steps, so add the directions below. Any tips from the post are in the description.");
    } else if (noIngredients) {
      setImportNotice('Imported! No ingredient list was found, so please check the ingredients below.');
    } else {
      setImportNotice('');
    }
    setActiveTab('manual');
  };

  // 1. Web Scraper
  const handleScrapeUrl = (e: React.FormEvent) => {
    e.preventDefault();
    return runImport(urlInput);
  };

  const runImport = async (rawInput: string) => {
    if (!rawInput.trim()) return;

    // A recipe sent from the other person's app: hand it over to be previewed and saved
    if (looksLikeRecipeCode(rawInput)) {
      setScrapeError('');
      if (onPasteRecipeCode && (await onPasteRecipeCode(rawInput))) onClose();
      else setScrapeError("That recipe code didn't work. Ask for it to be sent again, and make sure you pasted the whole message.");
      return;
    }

    let targetUrl = rawInput.trim();
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    // Instagram links use the caption puller instead of the page scraper
    if (targetUrl.includes('instagram.com')) {
      setScrapeError('');
      setInstagramUrl(targetUrl);
      handlePullInstagram(targetUrl);
      return;
    }

    // TikTok and YouTube links: read the video's caption or description
    if (isVideoLink(targetUrl)) {
      setScrapeError('');
      setInstagramUrl(targetUrl);
      setIsPullingInstagram(true);
      setInstagramError(null);
      setShowManualCaptionFallback(false);
      try {
        const result = await fetchVideoRecipeFromUrl(targetUrl);
        if (result.success && result.recipe) {
          setSourceType('video');
          applyParsedRecipe(result.recipe);
        } else {
          setInstagramError(result.error || "Couldn't read this video. Paste its caption below.");
          setShowManualCaptionFallback(true);
        }
      } catch (err: any) {
        setInstagramError(err.message || "Couldn't read this video. Paste its caption below.");
        setShowManualCaptionFallback(true);
      } finally {
        setIsPullingInstagram(false);
      }
      return;
    }

    setIsScraping(true);
    setScrapeError('');
    setInstagramError(null);

    try {
      const html = await fetchPageHtml(targetUrl);

      const parsed = parseRecipeFromHtml(html, targetUrl);
      if (parsed) {
        setSourceType('website');
        if (!parsed.ingredients?.length || !parsed.instructions?.length) {
          // No recipe data behind the page: read its visible text instead
          const pageText = pageTextFromHtml(html);
          if (pageText) {
            const fromText = parseRawRecipeText(pageText, parsed.title, { source: 'text' });
            const { creator: _creator, ...refined } = await refineWithAi(pageText, fromText);
            if (refined.ingredients?.length && refined.instructions?.length) {
              applyParsedRecipe({
                ...refined,
                title: refined.title || parsed.title,
                sourceType: 'website',
                sourceUrl: targetUrl,
                sourceName: parsed.sourceName,
                coverImage: parsed.coverImage,
              });
              return;
            }
          }
          throw new Error('No ingredients or steps found on page.');
        }
        applyParsedRecipe(await refineParsedRecipe(parsed));
      } else {
        throw new Error('No structured recipe found on page.');
      }
    } catch {
      setScrapeError(
        'Could not auto-scrape this page (some food blogs block proxies). You can paste the recipe text in the box below!'
      );
      setShowManualCaptionFallback(true);
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
  const handleParseText = async () => {
    if (!pastedText.trim() || isTidyingText) return;
    setIsTidyingText(true);
    // Only text that came from an Instagram post is treated as one; anything else is just a pasted recipe
    const fromInstagram = /instagram\.com/i.test(`${instagramUrl} ${sourceUrl}`);
    const { creator, ...parsed } = await refineWithAi(
      pastedText,
      parseRawRecipeText(pastedText, pastedTitle, { source: fromInstagram ? 'instagram' : 'text' })
    );
    setIsTidyingText(false);
    setSourceType(fromInstagram ? 'instagram' : 'manual');
    applyParsedRecipe({
      ...parsed,
      sourceName: sourceName || (creator ? `@${creator}` : fromInstagram ? 'Instagram Post' : 'Pasted recipe'),
      sourceUrl: sourceUrl || instagramUrl.trim() || undefined,
      coverImage: coverImage || undefined
    });
  };

  // 3. Cookbook OCR
  const addCookbookPages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // lets the same photo be picked again
    if (files.length === 0) return;
    setCookbookPages((prev) => [
      ...prev,
      ...files.map((file, i) => ({ id: `${Date.now()}-${prev.length + i}`, file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const removeCookbookPage = (id: string) => {
    setCookbookPages((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const moveCookbookPage = (id: string, direction: -1 | 1) => {
    setCookbookPages((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const setCookbookFoodPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCookbookFood((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
  };

  const handleCookbookScan = async () => {
    if (cookbookPages.length === 0 || isProcessingOcr) return;

    setIsProcessingOcr(true);
    setOcrProgress({ status: 'Reading photo...', progress: 0.05 });

    try {
      const { parsedRecipe, rawText } = await processCookbookImages(
        cookbookPages.map((p) => p.file),
        (p) => setOcrProgress(p)
      );
      if (rawText.replace(/\s/g, '').length < 20) {
        notify("We couldn't read any text in these photos. Try a clearer shot with good lighting, held straight above the page.");
        return;
      }
      // Small copies of the pages are kept on the recipe for reference; the food photo becomes its cover
      const [pages, cover] = await Promise.all([
        Promise.all(cookbookPages.map((p) => fileToCompressedDataUrl(p.file, 1400, 0.7))),
        cookbookFood ? fileToCompressedDataUrl(cookbookFood.file) : Promise.resolve(''),
      ]);
      setCookbookPageData(pages.filter(Boolean));
      setSourceType('cookbook');
      applyParsedRecipe({
        ...parsedRecipe,
        sourceName: sourceName || 'Cookbook Recipe',
        coverImage: cover || undefined,
      });
    } catch (err) {
      console.error(err);
      notify('Reading the photos failed. Try clearer shots with good lighting!');
    } finally {
      setIsProcessingOcr(false);
      setOcrProgress(null);
    }
  };

  // Final Form Submission
  const handleSubmitFinal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      notify('Please enter a recipe title');
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

    const userPhotos: string[] = [...(initialRecipe?.userPhotos || []), ...cookbookPageData];

    const newRecipe: Recipe = {
      id: initialRecipe?.id || `recipe-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      sourceType,
      sourceName: sourceName.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      coverImage: coverImage.trim() || undefined,
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
      folders: initialRecipe?.folders,
      importedBy: initialRecipe?.importedBy,
      nutrition: initialRecipe?.nutrition,
      createdAt: initialRecipe?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(newRecipe);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 landscape:p-2 sm:landscape:p-4 animate-in fade-in duration-200">
      
      <div className="bg-[#FDFBF7] w-full max-w-4xl h-[100dvh] sm:h-auto sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col sm:max-h-[94vh] border border-[#EFE7DE]">
        
        {/* ReciMe Header */}
        <div style={{ paddingTop: "max(1.25rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))" }} className="bg-white px-5 sm:px-7 py-3.5 sm:py-4 border-b border-[#EFE7DE] flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg sm:text-2xl font-bold text-[#221E1B]">
              {initialRecipe ? 'Edit Recipe' : 'Import New Recipe'}
            </h2>
            <p className="text-xs text-[#82786D] mt-0.5 font-medium">
              Save from Instagram, websites, pasted text, or scan cookbooks
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
        <div className="bg-[#F6EFE6] px-3 sm:px-6 pt-2.5 flex gap-1 sm:gap-2 border-b border-[#E8DFC9] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('website')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-[11px] sm:text-sm whitespace-nowrap font-bold transition-all cursor-pointer ${
              activeTab === 'website'
                ? 'bg-[#FDFBF7] text-[#FF5B26] shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <Globe className="hidden sm:block w-4 h-4 text-[#FF5B26]" />
            <span>
              <span className="sm:hidden">Instagram / Web / Text</span>
              <span className="hidden sm:inline">Instagram / Web Site / Text</span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cookbook')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-[11px] sm:text-sm whitespace-nowrap font-bold transition-all cursor-pointer ${
              activeTab === 'cookbook'
                ? 'bg-[#FDFBF7] text-amber-800 shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <BookOpen className="hidden sm:block w-4 h-4 text-amber-700" />
            <span>Cookbook Scan</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 rounded-t-2xl text-[11px] sm:text-sm whitespace-nowrap font-bold transition-all ml-auto cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-[#FDFBF7] text-[#221E1B] shadow-xs'
                : 'text-[#6E6457] hover:text-[#221E1B]'
            }`}
          >
            <PenTool className="hidden sm:block w-4 h-4 text-[#4B7D50]" />
            <span>Edit Fields</span>
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))" }} className="overflow-y-auto flex-1 p-4 sm:p-7">
          
          {/* TAB 1: WEBSITE LINK */}
          {activeTab === 'website' && (
            <div className="space-y-4 max-w-xl mx-auto py-4 sm:py-6">
              <div className="text-center space-y-2 mb-4 sm:mb-6">
                <div className="w-12 h-12 rounded-3xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-xs">
                  <Globe className="w-6 h-6 stroke-[2.2]" />
                </div>
                <h3 className="font-serif text-lg font-bold text-[#221E1B]">
                  Paste a Recipe Link or Text
                </h3>
                <p className="text-xs text-[#7A7165]">
                  Works with Instagram, TikTok and YouTube videos, NYT Cooking, Half Baked Harvest, Allrecipes, and thousands more.
                  Got a recipe sent to you? Paste the whole message here.
                </p>
              </div>

              {clipboardHint && !urlInput && (
                <button
                  type="button"
                  onClick={() => { setUrlInput(clipboardHint); const t = clipboardHint; setClipboardHint(''); runImport(t); }}
                  className="w-full text-left p-3.5 rounded-2xl bg-[#FFEFEA] border border-[#FFD5C8] text-xs text-[#C2410C] font-semibold flex items-center gap-2.5 cursor-pointer hover:bg-[#FFE4DA] transition-all"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="min-w-0">
                    Looks like you copied a recipe link. Tap to import it:
                    <span className="block truncate font-normal text-[#7A7165]">{clipboardHint}</span>
                  </span>
                </button>
              )}

              <form onSubmit={handleScrapeUrl} className="space-y-3">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.instagram.com/reel/... or any recipe website"
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
                  disabled={isScraping || isPullingInstagram || !urlInput.trim()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF5B26]/25 transition-all cursor-pointer"
                >
                  {isScraping || isPullingInstagram ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isPullingInstagram ? 'Pulling Caption...' : 'Extracting Ingredients & Steps...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Import Recipe</span>
                    </>
                  )}
                </button>
              </form>

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
              {/* Manual Caption Paste Accordion / Fallback */}
              <div className="p-4 sm:p-5 bg-white rounded-3xl border border-[#EFE7DE] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#221E1B]">
                      {showManualCaptionFallback ? 'Paste Recipe Text:' : 'Or Paste Recipe Text Instead'}
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
                      disabled={!pastedText.trim() || isTidyingText}
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
                Scan a Cookbook Recipe
              </h3>
              <p className="text-xs text-[#7A7165] max-w-md mx-auto">
                Take a photo of each page the recipe is on. Add as many as you need, in order. You can also add a photo of the finished dish.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#DFD5C7] rounded-2xl bg-white hover:bg-[#FFF8F5] cursor-pointer transition-all">
                  <Camera className="w-7 h-7 text-amber-700 mb-1.5" />
                  <span className="text-xs font-bold text-[#221E1B]">Take a photo</span>
                  <input type="file" accept="image/*" capture="environment" onChange={addCookbookPages} className="hidden" />
                </label>
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#DFD5C7] rounded-2xl bg-white hover:bg-[#FFF8F5] cursor-pointer transition-all">
                  <ImagePlus className="w-7 h-7 text-amber-700 mb-1.5" />
                  <span className="text-xs font-bold text-[#221E1B]">Choose photos</span>
                  <input type="file" accept="image/*" multiple onChange={addCookbookPages} className="hidden" />
                </label>
              </div>

              {cookbookPages.length > 0 && (
                <div className="text-left space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#665D52]">
                    Recipe pages ({cookbookPages.length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {cookbookPages.map((page, index) => (
                      <div key={page.id} className="relative rounded-xl overflow-hidden border border-[#DFD5C7] bg-white">
                        <img src={page.preview} alt={`Page ${index + 1}`} className="w-full h-24 object-cover" />
                        <span className="absolute top-1 left-1 bg-[#221E1B]/80 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCookbookPage(page.id)}
                          aria-label={`Remove page ${index + 1}`}
                          className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5 text-[#221E1B]" />
                        </button>
                        {cookbookPages.length > 1 && (
                          <div className="flex justify-between px-1.5 py-1 text-[11px] font-bold text-[#665D52]">
                            <button type="button" disabled={index === 0} onClick={() => moveCookbookPage(page.id, -1)} aria-label="Move earlier" className="disabled:opacity-30 cursor-pointer px-1">←</button>
                            <button type="button" disabled={index === cookbookPages.length - 1} onClick={() => moveCookbookPage(page.id, 1)} aria-label="Move later" className="disabled:opacity-30 cursor-pointer px-1">→</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-left space-y-2 pt-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#665D52]">
                  Photo of the finished dish <span className="font-medium normal-case tracking-normal">(optional, becomes the cover)</span>
                </p>
                {cookbookFood ? (
                  <div className="flex items-center gap-3">
                    <img src={cookbookFood.preview} alt="Finished dish" className="w-20 h-20 rounded-xl object-cover border border-[#DFD5C7]" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(cookbookFood.preview);
                        setCookbookFood(null);
                      }}
                      className="text-xs font-bold text-[#C73B0D] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-[#DFD5C7] bg-white text-xs font-bold text-[#544C42] hover:bg-[#FFF8F5] cursor-pointer transition-all">
                    <Camera className="w-4 h-4 text-amber-700" />
                    Add a food photo
                    <input type="file" accept="image/*" onChange={setCookbookFoodPhoto} className="hidden" />
                  </label>
                )}
              </div>

              <button
                type="button"
                onClick={handleCookbookScan}
                disabled={cookbookPages.length === 0 || isProcessingOcr}
                className="w-full py-3 px-4 rounded-2xl bg-[#221E1B] hover:bg-[#38332E] disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {cookbookPages.length === 0
                  ? 'Add a photo to begin'
                  : `Read recipe from ${cookbookPages.length} photo${cookbookPages.length === 1 ? '' : 's'}`}
              </button>
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

              {importNotice && (
                <div className="p-3.5 bg-amber-50 text-amber-900 text-xs rounded-2xl border border-amber-200 leading-relaxed">
                  {importNotice}
                </div>
              )}

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
                    My Notes / First Thoughts (Optional)
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


