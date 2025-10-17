/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'qwen-code';

export const EVENT_USER_PROMPT = 'qwen_code.user_prompt';
export const EVENT_TOOL_CALL = 'qwen_code.tool_call';
export const EVENT_API_REQUEST = 'qwen_code.api_request';
export const EVENT_API_ERROR = 'qwen_code.api_error';
export const EVENT_API_RESPONSE = 'qwen_code.api_response';
export const EVENT_CLI_CONFIG = 'qwen_code.config';
export const EVENT_EXTENSION_DISABLE = 'qwen_code.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'qwen_code.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'qwen_code.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'qwen_code.extension_uninstall';
export const EVENT_FLASH_FALLBACK = 'qwen_code.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'qwen_code.ripgrep_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'qwen_code.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'qwen_code.slash_command';
export const EVENT_IDE_CONNECTION = 'qwen_code.ide_connection';
export const EVENT_CONVERSATION_FINISHED = 'qwen_code.conversation_finished';
export const EVENT_CHAT_COMPRESSION = 'qwen_code.chat_compression';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'qwen_code.malformed_json_response';
export const EVENT_INVALID_CHUNK = 'qwen_code.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'qwen_code.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'qwen_code.chat.content_retry_failure';
export const EVENT_FILE_OPERATION = 'qwen_code.file_operation';
export const EVENT_MODEL_SLASH_COMMAND = 'qwen_code.slash_command.model';
export const EVENT_SUBAGENT_EXECUTION = 'qwen-code.subagent_execution';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'qwen_code.startup.performance';
export const EVENT_MEMORY_USAGE = 'qwen_code.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'qwen_code.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'qwen_code.performance.regression';
