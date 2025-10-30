/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import { type DOMElement, measureElement } from 'ink';
import { App } from './App.js';
import { AppContext } from './contexts/AppContext.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import {
  type HistoryItem,
  ToolCallStatus,
  type HistoryItemWithoutId,
  AuthState,
} from './types.js';
import { MessageType, StreamingState } from './types.js';
import {
  type EditorType,
  type Config,
  type IdeInfo,
  type IdeContext,
  type UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
  IdeClient,
  ideContextStore,
  getErrorMessage,
  getAllGeminiMdFilenames,
  ShellExecutionService,
} from '@qwen-code/qwen-code-core';
import { validateAuthMethod } from '../config/auth.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import process from 'node:process';
import { useHistory } from './hooks/useHistoryManager.js';
import { useMemoryMonitor } from './hooks/useMemoryMonitor.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './auth/useAuth.js';
import { useQwenAuth } from './hooks/useQwenAuth.js';
import { useQuotaAndFallback } from './hooks/useQuotaAndFallback.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { calculatePromptWidths } from './components/InputPrompt.js';
import { useStdin, useStdout } from 'ink';
import ansiEscapes from 'ansi-escapes';
import * as fs from 'node:fs';
import { basename } from 'node:path';
import { computeWindowTitle } from '../utils/windowTitle.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useVim } from './hooks/vim.js';
import { type LoadedSettings, SettingScope } from '../config/settings.js';
import { type InitializationResult } from '../core/initializer.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { keyMatchers, Command } from './keyMatchers.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useIdeTrustListener } from './hooks/useIdeTrustListener.js';
import { type IdeIntegrationNudgeResult } from './IdeIntegrationNudge.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { type UpdateObject } from './utils/updateCheck.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup, runExitCleanup } from '../utils/cleanup.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useWorkspaceMigration } from './hooks/useWorkspaceMigration.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useExtensionUpdates } from './hooks/useExtensionUpdates.js';
import { ShellFocusContext } from './contexts/ShellFocusContext.js';
import { useQuitConfirmation } from './hooks/useQuitConfirmation.js';
import { useWelcomeBack } from './hooks/useWelcomeBack.js';
import { useDialogClose } from './hooks/useDialogClose.js';
import { type VisionSwitchOutcome } from './components/ModelSwitchDialog.js';
import { processVisionSwitchOutcome } from './hooks/useVisionAutoSwitch.js';
import { useSubagentCreateDialog } from './hooks/useSubagentCreateDialog.js';
import { useAgentsManagerDialog } from './hooks/useAgentsManagerDialog.js';

const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

function isToolExecuting(pendingHistoryItems: HistoryItemWithoutId[]) {
  return pendingHistoryItems.some((item) => {
    if (item && item.type === 'tool_group') {
      return item.tools.some(
        (tool) => ToolCallStatus.Executing === tool.status,
      );
    }
    return false;
  });
}

interface AppContainerProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  initializationResult: InitializationResult;
}

/**
 * The fraction of the terminal width to allocate to the shell.
 * This provides horizontal padding.
 */
const SHELL_WIDTH_FRACTION = 0.89;

/**
 * The number of lines to subtract from the available terminal height
 * for the shell. This provides vertical padding and space for other UI elements.
 */
const SHELL_HEIGHT_PADDING = 10;

export const AppContainer = (props: AppContainerProps) => {
  const { settings, config, initializationResult } = props;
  const historyManager = useHistory();
  useMemoryMonitor(historyManager);
  const [corgiMode, setCorgiMode] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const [themeError, setThemeError] = useState<string | null>(
    initializationResult.themeError,
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [embeddedShellFocused, setEmbeddedShellFocused] = useState(false);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(
    initializationResult.geminiMdFileCount,
  );
  const [shellModeActive, setShellModeActive] = useState(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
  const [isTrustedFolder, setIsTrustedFolder] = useState<boolean | undefined>(
    config.isTrustedFolder(),
  );

  const extensions = config.getExtensions();
  const {
    extensionsUpdateState,
    extensionsUpdateStateInternal,
    dispatchExtensionStateUpdate,
    confirmUpdateExtensionRequests,
    addConfirmUpdateExtensionRequest,
  } = useExtensionUpdates(
    extensions,
    historyManager.addItem,
    config.getWorkingDir(),
  );

  const [isPermissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const openPermissionsDialog = useCallback(
    () => setPermissionsDialogOpen(true),
    [],
  );
  const closePermissionsDialog = useCallback(
    () => setPermissionsDialogOpen(false),
    [],
  );

  // Helper to determine the effective model, considering the fallback state.
  const getEffectiveModel = useCallback(() => {
    if (config.isInFallbackMode()) {
      return DEFAULT_GEMINI_FLASH_MODEL;
    }
    return config.getModel();
  }, [config]);

  const [currentModel, setCurrentModel] = useState(getEffectiveModel());

  const [userTier] = useState<UserTierId | undefined>(undefined);

  const [isConfigInitialized, setConfigInitialized] = useState(false);

  const logger = useLogger(config.storage);
  const [userMessages, setUserMessages] = useState<string[]>([]);

  // Terminal and layout hooks
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();

  // Additional hooks moved from App.tsx
  const { stats: sessionStats } = useSessionStats();
  const branchName = useGitBranchName(config.getTargetDir());

  // Layout measurements
  const mainControlsRef = useRef<DOMElement>(null);
  const originalTitleRef = useRef(
    computeWindowTitle(basename(config.getTargetDir())),
  );
  const lastTitleRef = useRef<string | null>(null);
  const staticExtraHeight = 3;

  useEffect(() => {
    (async () => {
      // Note: the program will not work if this fails so let errors be
      // handled by the global catch.
      await config.initialize();
      setConfigInitialized(true);
    })();
    registerCleanup(async () => {
      const ideClient = await IdeClient.getInstance();
      await ideClient.disconnect();
    });
  }, [config]);

  useEffect(
    () => setUpdateHandler(historyManager.addItem, setUpdateInfo),
    [historyManager.addItem],
  );

  // Watch for model changes (e.g., from Flash fallback)
  useEffect(() => {
    const checkModelChange = () => {
      const effectiveModel = getEffectiveModel();
      if (effectiveModel !== currentModel) {
        setCurrentModel(effectiveModel);
      }
    };

    checkModelChange();
    const interval = setInterval(checkModelChange, 1000); // Check every second

    return () => clearInterval(interval);
  }, [config, currentModel, getEffectiveModel]);

  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  // Derive widths for InputPrompt using shared helper
  const { inputWidth, suggestionsWidth } = useMemo(() => {
    const { inputWidth, suggestionsWidth } =
      calculatePromptWidths(terminalWidth);
    return { inputWidth, suggestionsWidth };
  }, [terminalWidth]);
  const mainAreaWidth = Math.floor(terminalWidth * 0.9);
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || [];
      const currentSessionUserMessages = historyManager.history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse();
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]);
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [historyManager.history, logger]);

  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal);
    setHistoryRemountKey((prev) => prev + 1);
  }, [setHistoryRemountKey, stdout]);

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(
    settings,
    setThemeError,
    historyManager.addItem,
    initializationResult.themeError,
  );

  const {
    setAuthState,
    authError,
    onAuthError,
    isAuthDialogOpen,
    isAuthenticating,
    handleAuthSelect,
    openAuthDialog,
  } = useAuthCommand(settings, config);

  // Qwen OAuth authentication state
  const {
    isQwenAuth,
    isQwenAuthenticating,
    deviceAuth,
    authStatus,
    authMessage,
    cancelQwenAuth,
  } = useQwenAuth(settings, isAuthenticating);

  const { proQuotaRequest, handleProQuotaChoice } = useQuotaAndFallback({
    config,
    historyManager,
    userTier,
    setAuthState,
    setModelSwitchedFromQuotaError,
  });

  // Handle Qwen OAuth timeout
  const handleQwenAuthTimeout = useCallback(() => {
    onAuthError('Qwen OAuth authentication timed out. Please try again.');
    cancelQwenAuth();
    setAuthState(AuthState.Updating);
  }, [onAuthError, cancelQwenAuth, setAuthState]);

  // Handle Qwen OAuth cancel
  const handleQwenAuthCancel = useCallback(() => {
    onAuthError('Qwen OAuth authentication cancelled.');
    cancelQwenAuth();
    setAuthState(AuthState.Updating);
  }, [onAuthError, cancelQwenAuth, setAuthState]);

  // Sync user tier from config when authentication changes
  // TODO: Implement getUserTier() method on Config if needed
  // useEffect(() => {
  //   if (authState === AuthState.Authenticated) {
  //     setUserTier(config.getUserTier());
  //   }
  // }, [config, authState]);

  // Check for enforced auth type mismatch
  useEffect(() => {
    if (
      settings.merged.security?.auth?.enforcedType &&
      settings.merged.security?.auth.selectedType &&
      settings.merged.security?.auth.enforcedType !==
        settings.merged.security?.auth.selectedType
    ) {
      onAuthError(
        `Authentication is enforced to be ${settings.merged.security?.auth.enforcedType}, but you are currently using ${settings.merged.security?.auth.selectedType}.`,
      );
    } else if (
      settings.merged.security?.auth?.selectedType &&
      !settings.merged.security?.auth?.useExternal
    ) {
      const error = validateAuthMethod(
        settings.merged.security.auth.selectedType,
      );
      if (error) {
        onAuthError(error);
      }
    }
  }, [
    settings.merged.security?.auth?.selectedType,
    settings.merged.security?.auth?.enforcedType,
    settings.merged.security?.auth?.useExternal,
    onAuthError,
  ]);

  const [editorError, setEditorError] = useState<string | null>(null);
  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, historyManager.addItem);

  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

  const { isModelDialogOpen, openModelDialog, closeModelDialog } =
    useModelCommand();

  const {
    showWorkspaceMigrationDialog,
    workspaceExtensions,
    onWorkspaceMigrationDialogOpen,
    onWorkspaceMigrationDialogClose,
  } = useWorkspaceMigration(settings);

  const { toggleVimEnabled } = useVimMode();

  const { showQuitConfirmation } = useQuitConfirmation();

  const {
    isSubagentCreateDialogOpen,
    openSubagentCreateDialog,
    closeSubagentCreateDialog,
  } = useSubagentCreateDialog();
  const {
    isAgentsManagerDialogOpen,
    openAgentsManagerDialog,
    closeAgentsManagerDialog,
  } = useAgentsManagerDialog();

  // Vision model auto-switch dialog state (must be before slashCommandActions)
  const [isVisionSwitchDialogOpen, setIsVisionSwitchDialogOpen] =
    useState(false);
  const [visionSwitchResolver, setVisionSwitchResolver] = useState<{
    resolve: (result: {
      modelOverride?: string;
      persistSessionModel?: string;
      showGuidance?: boolean;
    }) => void;
    reject: () => void;
  } | null>(null);

  const slashCommandActions = useMemo(
    () => ({
      openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openSettingsDialog,
      openModelDialog,
      openPermissionsDialog,
      quit: (messages: HistoryItem[]) => {
        setQuittingMessages(messages);
        setTimeout(async () => {
          await runExitCleanup();
          process.exit(0);
        }, 100);
      },
      setDebugMessage,
      toggleCorgiMode: () => setCorgiMode((prev) => !prev),
      dispatchExtensionStateUpdate,
      addConfirmUpdateExtensionRequest,
      openSubagentCreateDialog,
      openAgentsManagerDialog,
      _showQuitConfirmation: showQuitConfirmation,
    }),
    [
      openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openSettingsDialog,
      openModelDialog,
      setDebugMessage,
      setCorgiMode,
      dispatchExtensionStateUpdate,
      openPermissionsDialog,
      addConfirmUpdateExtensionRequest,
      showQuitConfirmation,
      openSubagentCreateDialog,
      openAgentsManagerDialog,
    ],
  );

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
    shellConfirmationRequest,
    confirmationRequest,
    quitConfirmationRequest,
  } = useSlashCommandProcessor(
    config,
    settings,
    historyManager.addItem,
    historyManager.clearItems,
    historyManager.loadHistory,
    refreshStatic,
    toggleVimEnabled,
    setIsProcessing,
    setGeminiMdFileCount,
    slashCommandActions,
    extensionsUpdateStateInternal,
    isConfigInitialized,
  );

  // Vision switch handlers
  const handleVisionSwitchRequired = useCallback(
    async (_query: unknown) =>
      new Promise<{
        modelOverride?: string;
        persistSessionModel?: string;
        showGuidance?: boolean;
      }>((resolve, reject) => {
        setVisionSwitchResolver({ resolve, reject });
        setIsVisionSwitchDialogOpen(true);
      }),
    [],
  );

  const handleVisionSwitchSelect = useCallback(
    (outcome: VisionSwitchOutcome) => {
      setIsVisionSwitchDialogOpen(false);
      if (visionSwitchResolver) {
        const result = processVisionSwitchOutcome(outcome);
        visionSwitchResolver.resolve(result);
        setVisionSwitchResolver(null);
      }
    },
    [visionSwitchResolver],
  );

  const performMemoryRefresh = useCallback(async () => {
    historyManager.addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (QWEN.md or other context files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        settings.merged.context?.loadMemoryFromIncludeDirectories
          ? config.getWorkspaceContext().getDirectories()
          : [],
        config.getDebugMode(),
        config.getFileService(),
        settings.merged,
        config.getExtensionContextFilePaths(),
        config.isTrustedFolder(),
        settings.merged.context?.importFormat || 'tree', // Use setting or default to 'tree'
        config.getFileFilteringOptions(),
      );

      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${
            memoryContent.length > 0
              ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
              : 'No memory content found.'
          }`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(
            0,
            200,
          )}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      historyManager.addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('Error refreshing memory:', error);
    }
  }, [config, historyManager, settings.merged]);

  const cancelHandlerRef = useRef<() => void>(() => {});

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    cancelOngoingRequest,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
  } = useGeminiStream(
    config.getGeminiClient(),
    historyManager.history,
    historyManager.addItem,
    config,
    settings,
    setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    () => settings.merged.general?.preferredEditor as EditorType,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
    refreshStatic,
    () => cancelHandlerRef.current(),
    settings.merged.experimental?.visionModelPreview ?? false, // visionModelPreviewEnabled
    setEmbeddedShellFocused,
    terminalWidth,
    terminalHeight,
    handleVisionSwitchRequired, // onVisionSwitchRequired
    embeddedShellFocused,
  );

  // Auto-accept indicator
  const showAutoAcceptIndicator = useAutoAcceptIndicator({
    config,
    addItem: historyManager.addItem,
    onApprovalModeChange: handleApprovalModeChange,
  });

  const { messageQueue, addMessage, clearQueue, getQueuedMessagesText } =
    useMessageQueue({
      isConfigInitialized,
      streamingState,
      submitQuery,
    });

  // Callback for handling final submit (must be after addMessage from useMessageQueue)
  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      addMessage(submittedValue);
    },
    [addMessage],
  );

  // Welcome back functionality (must be after handleFinalSubmit)
  const {
    welcomeBackInfo,
    showWelcomeBackDialog,
    welcomeBackChoice,
    handleWelcomeBackSelection,
    handleWelcomeBackClose,
  } = useWelcomeBack(config, handleFinalSubmit, buffer, settings.merged);

  cancelHandlerRef.current = useCallback(() => {
    const pendingHistoryItems = [
      ...pendingSlashCommandHistoryItems,
      ...pendingGeminiHistoryItems,
    ];
    if (isToolExecuting(pendingHistoryItems)) {
      buffer.setText(''); // Just clear the prompt
      return;
    }

    const lastUserMessage = userMessages.at(-1);
    let textToSet = lastUserMessage || '';

    const queuedText = getQueuedMessagesText();
    if (queuedText) {
      textToSet = textToSet ? `${textToSet}\n\n${queuedText}` : queuedText;
      clearQueue();
    }

    if (textToSet) {
      buffer.setText(textToSet);
    }
  }, [
    buffer,
    userMessages,
    getQueuedMessagesText,
    clearQueue,
    pendingSlashCommandHistoryItems,
    pendingGeminiHistoryItems,
  ]);

  const handleClearScreen = useCallback(() => {
    historyManager.clearItems();
    clearConsoleMessagesState();
    console.clear();
    refreshStatic();
  }, [historyManager, clearConsoleMessagesState, refreshStatic]);

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

  /**
   * Determines if the input prompt should be active and accept user input.
   * Input is disabled during:
   * - Initialization errors
   * - Slash command processing
   * - Tool confirmations (WaitingForConfirmation state)
   * - Any future streaming states not explicitly allowed
   */
  const isInputActive =
    !initError &&
    !isProcessing &&
    (streamingState === StreamingState.Idle ||
      streamingState === StreamingState.Responding) &&
    !proQuotaRequest;

  const [controlsHeight, setControlsHeight] = useState(0);

  useLayoutEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      if (fullFooterMeasurement.height > 0) {
        setControlsHeight(fullFooterMeasurement.height);
      }
    }
  }, [buffer, terminalWidth, terminalHeight]);

  // Compute available terminal height based on controls measurement
  const availableTerminalHeight = Math.max(
    0,
    terminalHeight - controlsHeight - staticExtraHeight - 2,
  );

  config.setShellExecutionConfig({
    terminalWidth: Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
    terminalHeight: Math.max(
      Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING),
      1,
    ),
    pager: settings.merged.tools?.shell?.pager,
    showColor: settings.merged.tools?.shell?.showColor,
  });

  const isFocused = useFocus();
  useBracketedPaste();

  // Context file names computation
  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.context?.fileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllGeminiMdFilenames();
  }, [settings.merged.context?.fileName]);
  // Initial prompt handling
  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const initialPromptSubmitted = useRef(false);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (activePtyId) {
      ShellExecutionService.resizePty(
        activePtyId,
        Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
        Math.max(Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING), 1),
      );
    }
  }, [terminalWidth, availableTerminalHeight, activePtyId]);

  useEffect(() => {
    if (
      initialPrompt &&
      isConfigInitialized &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showWelcomeBackDialog &&
      !isVisionSwitchDialogOpen &&
      welcomeBackChoice !== 'restart' &&
      geminiClient?.isInitialized?.()
    ) {
      handleFinalSubmit(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    isConfigInitialized,
    handleFinalSubmit,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    showWelcomeBackDialog,
    isVisionSwitchDialogOpen,
    welcomeBackChoice,
    geminiClient,
  ]);

  const [idePromptAnswered, setIdePromptAnswered] = useState(false);
  const [currentIDE, setCurrentIDE] = useState<IdeInfo | null>(null);

  useEffect(() => {
    const getIde = async () => {
      const ideClient = await IdeClient.getInstance();
      const currentIde = ideClient.getCurrentIde();
      setCurrentIDE(currentIde || null);
    };
    getIde();
  }, []);
  const shouldShowIdePrompt = Boolean(
    currentIDE &&
      !config.getIdeMode() &&
      !settings.merged.ide?.hasSeenNudge &&
      !idePromptAnswered,
  );

  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);

  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const [showIdeRestartPrompt, setShowIdeRestartPrompt] = useState(false);

  const { isFolderTrustDialogOpen, handleFolderTrustSelect, isRestarting } =
    useFolderTrust(settings, setIsTrustedFolder);
  const {
    needsRestart: ideNeedsRestart,
    restartReason: ideTrustRestartReason,
  } = useIdeTrustListener();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (ideNeedsRestart) {
      // IDE trust changed, force a restart.
      setShowIdeRestartPrompt(true);
    }
  }, [ideNeedsRestart]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, refreshStatic]);

  useEffect(() => {
    const unsubscribe = ideContextStore.subscribe(setIdeContextState);
    setIdeContextState(ideContextStore.get());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const openDebugConsole = () => {
      setShowErrorDetails(true);
      setConstrainHeight(false);
    };
    appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

    const logErrorHandler = (errorMessage: unknown) => {
      handleNewMessage({
        type: 'error',
        content: String(errorMessage),
        count: 1,
      });
    };
    appEvents.on(AppEvent.LogError, logErrorHandler);

    return () => {
      appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
      appEvents.off(AppEvent.LogError, logErrorHandler);
    };
  }, [handleNewMessage]);

  const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
    setShowEscapePrompt(showPrompt);
  }, []);

  const handleIdePromptComplete = useCallback(
    (result: IdeIntegrationNudgeResult) => {
      if (result.userSelection === 'yes') {
        handleSlashCommand('/ide install');
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      } else if (result.userSelection === 'dismiss') {
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      }
      setIdePromptAnswered(true);
    },
    [handleSlashCommand, settings],
  );

  const { elapsedTime, currentLoadingPhrase } = useLoadingIndicator(
    streamingState,
    settings.merged.ui?.customWittyPhrases,
  );

  // Dialog close functionality
  const { closeAnyOpenDialog } = useDialogClose({
    isThemeDialogOpen,
    handleThemeSelect,
    isAuthDialogOpen,
    handleAuthSelect,
    selectedAuthType: settings.merged.security?.auth?.selectedType,
    isEditorDialogOpen,
    exitEditorDialog,
    isSettingsDialogOpen,
    closeSettingsDialog,
    isFolderTrustDialogOpen,
    showWelcomeBackDialog,
    handleWelcomeBackClose,
    quitConfirmationRequest,
  });

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    ) => {
      // Fast double-press: Direct quit (preserve user habit)
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        // Exit directly without showing confirmation dialog
        handleSlashCommand('/quit');
        return;
      }

      // First press: Prioritize cleanup tasks

      // Special case: If quit-confirm dialog is open, Ctrl+C means "quit immediately"
      if (quitConfirmationRequest) {
        handleSlashCommand('/quit');
        return;
      }

      // 1. Close other dialogs (highest priority)
      /**
       * For AuthDialog it is required to complete the authentication process,
       * otherwise user cannot proceed to the next step.
       * So a quit on AuthDialog should go with normal two press quit
       * and without quit-confirm dialog.
       */
      if (isAuthDialogOpen) {
        setPressedOnce(true);
        timerRef.current = setTimeout(() => {
          setPressedOnce(false);
        }, 500);
        return;
      }

      // 2. Close other dialogs (highest priority)
      if (closeAnyOpenDialog()) {
        return; // Dialog closed, end processing
      }

      // 3. Cancel ongoing requests
      if (streamingState === StreamingState.Responding) {
        cancelOngoingRequest?.();
        return; // Request cancelled, end processing
      }

      // 3. Clear input buffer (if has content)
      if (buffer.text.length > 0) {
        buffer.setText('');
        return; // Input cleared, end processing
      }

      // All cleanup tasks completed, show quit confirmation dialog
      handleSlashCommand('/quit-confirm');
    },
    [
      isAuthDialogOpen,
      handleSlashCommand,
      closeAnyOpenDialog,
      streamingState,
      cancelOngoingRequest,
      quitConfirmationRequest,
      buffer,
    ],
  );

  const handleGlobalKeypress = useCallback(
    (key: Key) => {
      // Debug log keystrokes if enabled
      if (settings.merged.general?.debugKeystrokeLogging) {
        console.log('[DEBUG] Keystroke:', JSON.stringify(key));
      }

      if (keyMatchers[Command.QUIT](key)) {
        if (isAuthenticating) {
          return;
        }

        // On first press: set flag, start timer, and call handleExit for cleanup/quit-confirm
        // On second press (within 500ms): handleExit sees flag and does fast quit
        if (!ctrlCPressedOnce) {
          setCtrlCPressedOnce(true);
          ctrlCTimerRef.current = setTimeout(() => {
            setCtrlCPressedOnce(false);
            ctrlCTimerRef.current = null;
          }, CTRL_EXIT_PROMPT_DURATION_MS);
        }

        handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
        return;
      } else if (keyMatchers[Command.EXIT](key)) {
        if (buffer.text.length > 0) {
          return;
        }
        handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
        return;
      }

      let enteringConstrainHeightMode = false;
      if (!constrainHeight) {
        enteringConstrainHeightMode = true;
        setConstrainHeight(true);
      }

      if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
        setShowErrorDetails((prev) => !prev);
      } else if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
        const newValue = !showToolDescriptions;
        setShowToolDescriptions(newValue);

        const mcpServers = config.getMcpServers();
        if (Object.keys(mcpServers || {}).length > 0) {
          handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
        }
      } else if (
        keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
        config.getIdeMode() &&
        ideContextState
      ) {
        handleSlashCommand('/ide status');
      } else if (
        keyMatchers[Command.SHOW_MORE_LINES](key) &&
        !enteringConstrainHeightMode
      ) {
        setConstrainHeight(false);
      } else if (keyMatchers[Command.TOGGLE_SHELL_INPUT_FOCUS](key)) {
        if (activePtyId || embeddedShellFocused) {
          setEmbeddedShellFocused((prev) => !prev);
        }
      }
    },
    [
      constrainHeight,
      setConstrainHeight,
      setShowErrorDetails,
      showToolDescriptions,
      setShowToolDescriptions,
      config,
      ideContextState,
      handleExit,
      ctrlCPressedOnce,
      setCtrlCPressedOnce,
      ctrlCTimerRef,
      buffer.text.length,
      ctrlDPressedOnce,
      setCtrlDPressedOnce,
      ctrlDTimerRef,
      handleSlashCommand,
      activePtyId,
      embeddedShellFocused,
      settings.merged.general?.debugKeystrokeLogging,
      isAuthenticating,
    ],
  );

  useKeypress(handleGlobalKeypress, { isActive: true });

  // Update terminal title with Gemini CLI status and thoughts
  useEffect(() => {
    // Respect both showStatusInTitle and hideWindowTitle settings
    if (
      !settings.merged.ui?.showStatusInTitle ||
      settings.merged.ui?.hideWindowTitle
    )
      return;

    let title;
    if (streamingState === StreamingState.Idle) {
      title = originalTitleRef.current;
    } else {
      const statusText = thought?.subject
        ?.replace(/[\r\n]+/g, ' ')
        .substring(0, 80);
      title = statusText || originalTitleRef.current;
    }

    // Pad the title to a fixed width to prevent taskbar icon resizing.
    const paddedTitle = title.padEnd(80, ' ');

    // Only update the title if it's different from the last value we set
    if (lastTitleRef.current !== paddedTitle) {
      lastTitleRef.current = paddedTitle;
      stdout.write(`\x1b]2;${paddedTitle}\x07`);
    }
    // Note: We don't need to reset the window title on exit because Gemini CLI is already doing that elsewhere
  }, [
    streamingState,
    thought,
    settings.merged.ui?.showStatusInTitle,
    settings.merged.ui?.hideWindowTitle,
    stdout,
  ]);

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  // Computed values
  const errorCount = useMemo(
    () =>
      filteredConsoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0),
    [filteredConsoleMessages],
  );

  const nightly = props.version.includes('nightly');

  const dialogsVisible =
    showWelcomeBackDialog ||
    showWorkspaceMigrationDialog ||
    shouldShowIdePrompt ||
    isFolderTrustDialogOpen ||
    !!shellConfirmationRequest ||
    !!confirmationRequest ||
    confirmUpdateExtensionRequests.length > 0 ||
    !!loopDetectionConfirmationRequest ||
    !!quitConfirmationRequest ||
    isThemeDialogOpen ||
    isSettingsDialogOpen ||
    isModelDialogOpen ||
    isVisionSwitchDialogOpen ||
    isPermissionsDialogOpen ||
    isAuthDialogOpen ||
    (isAuthenticating && isQwenAuthenticating) ||
    isEditorDialogOpen ||
    showIdeRestartPrompt ||
    !!proQuotaRequest ||
    isSubagentCreateDialogOpen ||
    isAgentsManagerDialogOpen;

  const pendingHistoryItems = useMemo(
    () => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems],
    [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems],
  );

  const uiState: UIState = useMemo(
    () => ({
      history: historyManager.history,
      historyManager,
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      isAuthDialogOpen,
      // Qwen OAuth state
      isQwenAuth,
      isQwenAuthenticating,
      deviceAuth,
      authStatus,
      authMessage,
      editorError,
      isEditorDialogOpen,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isModelDialogOpen,
      isPermissionsDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      confirmUpdateExtensionRequests,
      loopDetectionConfirmationRequest,
      quitConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      userMessages,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen: isFolderTrustDialogOpen ?? false,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      filteredConsoleMessages,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      messageQueue,
      showAutoAcceptIndicator,
      showWorkspaceMigrationDialog,
      workspaceExtensions,
      currentModel,
      userTier,
      proQuotaRequest,
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      extensionsUpdateState,
      activePtyId,
      embeddedShellFocused,
      // Vision switch dialog
      isVisionSwitchDialogOpen,
      // Welcome back dialog
      showWelcomeBackDialog,
      welcomeBackInfo,
      welcomeBackChoice,
      // Subagent dialogs
      isSubagentCreateDialogOpen,
      isAgentsManagerDialogOpen,
    }),
    [
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      isAuthDialogOpen,
      // Qwen OAuth state
      isQwenAuth,
      isQwenAuthenticating,
      deviceAuth,
      authStatus,
      authMessage,
      editorError,
      isEditorDialogOpen,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isModelDialogOpen,
      isPermissionsDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      confirmUpdateExtensionRequests,
      loopDetectionConfirmationRequest,
      quitConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      userMessages,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      filteredConsoleMessages,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      messageQueue,
      showAutoAcceptIndicator,
      showWorkspaceMigrationDialog,
      workspaceExtensions,
      userTier,
      proQuotaRequest,
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      currentModel,
      extensionsUpdateState,
      activePtyId,
      historyManager,
      embeddedShellFocused,
      // Vision switch dialog
      isVisionSwitchDialogOpen,
      // Welcome back dialog
      showWelcomeBackDialog,
      welcomeBackInfo,
      welcomeBackChoice,
      // Subagent dialogs
      isSubagentCreateDialogOpen,
      isAgentsManagerDialogOpen,
    ],
  );

  const uiActions: UIActions = useMemo(
    () => ({
      handleThemeSelect,
      handleThemeHighlight,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      // Qwen OAuth handlers
      handleQwenAuthTimeout,
      handleQwenAuthCancel,
      handleEditorSelect,
      exitEditorDialog,
      closeSettingsDialog,
      closeModelDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      onEscapePromptChange: handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit,
      handleClearScreen,
      onWorkspaceMigrationDialogOpen,
      onWorkspaceMigrationDialogClose,
      handleProQuotaChoice,
      // Vision switch dialog
      handleVisionSwitchSelect,
      // Welcome back dialog
      handleWelcomeBackSelection,
      handleWelcomeBackClose,
      // Subagent dialogs
      closeSubagentCreateDialog,
      closeAgentsManagerDialog,
    }),
    [
      handleThemeSelect,
      handleThemeHighlight,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      // Qwen OAuth handlers
      handleQwenAuthTimeout,
      handleQwenAuthCancel,
      handleEditorSelect,
      exitEditorDialog,
      closeSettingsDialog,
      closeModelDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit,
      handleClearScreen,
      onWorkspaceMigrationDialogOpen,
      onWorkspaceMigrationDialogClose,
      handleProQuotaChoice,
      handleVisionSwitchSelect,
      handleWelcomeBackSelection,
      handleWelcomeBackClose,
      // Subagent dialogs
      closeSubagentCreateDialog,
      closeAgentsManagerDialog,
    ],
  );

  return (
    <UIStateContext.Provider value={uiState}>
      <UIActionsContext.Provider value={uiActions}>
        <ConfigContext.Provider value={config}>
          <AppContext.Provider
            value={{
              version: props.version,
              startupWarnings: props.startupWarnings || [],
            }}
          >
            <ShellFocusContext.Provider value={isFocused}>
              <App />
            </ShellFocusContext.Provider>
          </AppContext.Provider>
        </ConfigContext.Provider>
      </UIActionsContext.Provider>
    </UIStateContext.Provider>
  );
};
