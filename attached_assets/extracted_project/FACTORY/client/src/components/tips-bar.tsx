import { useState, useEffect, useCallback } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "idengine-tips-hidden";
const DISABLED_KEY = "idengine-tips-disabled";

const tips = [
  "Для того чтобы получить наиболее качественный результат, зайдите в настройки и установите API нейросети.",
  "Редактируйте текст сценария и закадрового голоса, чтобы менять таймлайн и раскадровку.",
  "Используйте сгенерированные данные для дальнейшего видеомонтажа, тем самым ускорив и улучшив результат.",
  "Для создания потока Шортсов и вертикального контента: добавьте источники и генерируйте короткие видео из них!",
];

function getRandomTipIndex(currentIndex: number): number {
  if (tips.length <= 1) return 0;
  let newIndex = currentIndex;
  while (newIndex === currentIndex) {
    newIndex = Math.floor(Math.random() * tips.length);
  }
  return newIndex;
}

export function TipsBar() {
  const [isHidden, setIsHidden] = useState(true);
  const [isDisabled, setIsDisabled] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(() => 
    Math.floor(Math.random() * tips.length)
  );

  useEffect(() => {
    const hidden = localStorage.getItem(STORAGE_KEY);
    const disabled = localStorage.getItem(DISABLED_KEY);
    setIsHidden(hidden === "true");
    setIsDisabled(disabled === "true");
  }, []);

  useEffect(() => {
    if (isHidden) return;

    const interval = setInterval(() => {
      setCurrentTipIndex(prev => getRandomTipIndex(prev));
    }, 10000);

    return () => clearInterval(interval);
  }, [isHidden]);

  const handleHide = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsHidden(true);
  }, []);

  if (isHidden || isDisabled) return null;

  return (
    <div className="w-full px-3 py-2 sm:px-4 sm:py-3">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="relative bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50"
      >
        <div className="flex items-start gap-3 p-3 sm:p-4">
          <div className="flex-shrink-0 mt-0.5">
            <div className="p-1.5 bg-amber-100 dark:bg-amber-900/50">
              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.p
                key={currentTipIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed"
              >
                {tips[currentTipIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleHide}
            className="flex-shrink-0 h-7 w-7 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-none"
            data-testid="button-hide-tips"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-200 dark:bg-amber-800/50">
          <motion.div
            className="h-full bg-amber-400 dark:bg-amber-600"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 10, ease: "linear", repeat: Infinity }}
            key={currentTipIndex}
          />
        </div>
      </motion.div>
    </div>
  );
}

export function useTipsVisibility() {
  const [isHidden, setIsHidden] = useState(true);
  const [isDisabled, setIsDisabled] = useState(false);

  useEffect(() => {
    const hidden = localStorage.getItem(STORAGE_KEY);
    const disabled = localStorage.getItem(DISABLED_KEY);
    setIsHidden(hidden === "true");
    setIsDisabled(disabled === "true");
  }, []);

  const showTips = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsHidden(false);
  }, []);

  const setTipsDisabled = useCallback((disabled: boolean) => {
    if (disabled) {
      localStorage.setItem(DISABLED_KEY, "true");
    } else {
      localStorage.removeItem(DISABLED_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsDisabled(disabled);
    if (!disabled) setIsHidden(false);
  }, []);

  return { isHidden, isDisabled, showTips, setTipsDisabled };
}
