/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { ApplicationShell, WidgetManager, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetFactoryOptions, TERMINAL_WIDGET_FACTORY_ID } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TaskConfiguration, PanelKind } from '../common';
import { TaskDefinitionRegistry } from './task-definition-registry';

export interface TaskTerminalWidgetOpenerOptions extends WidgetOpenerOptions, TerminalWidgetFactoryOptions {
    taskPanel?: PanelKind;
    taskConfig?: TaskConfiguration;
}
export namespace TaskTerminalWidgetOpenerOptions {
    export function isDedicatedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return !!options.taskPanel && options.taskPanel === PanelKind.Dedicated;
    }

    export function isNewTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return !!options.taskPanel && options.taskPanel === PanelKind.New;
    }

    export function isSharedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return options.taskPanel === undefined || options.taskPanel === PanelKind.Shared;
    }
}

@injectable()
export class TaskTerminalWidgetManager {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    // Map indexed by terminal widget id
    protected terminalWidgetMap: Map<string, { isDedicated: boolean, taskConfig?: TaskConfiguration, widget: TerminalWidget }> = new Map();

    async getOrCreateWidget(options: TaskTerminalWidgetOpenerOptions): Promise<TerminalWidget> {
        const isDedicated = TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(options);
        if (isDedicated && !options.taskConfig) {
            throw new Error('"taskConfig" must be included as part of the "option" if "isDedicated" is true');
        }

        const { isNew, widget } = await this.getWidgetToRunTask(options);
        if (isNew) {
            this.shell.addWidget(widget, { area: options.widgetOptions ? options.widgetOptions.area : 'bottom' });
            this.terminalWidgetMap.set(widget.id, {
                isDedicated, taskConfig: options.taskConfig, widget
            });
        } else if (options.title) {
            widget.setTitle(options.title);
        }

        if (options.mode === 'reveal') {
            this.shell.revealWidget(widget.id);
        } else if (options.mode === 'activate') {
            this.shell.activateWidget(widget.id);
        }

        return widget;
    }

    protected async getWidgetToRunTask(options: TaskTerminalWidgetOpenerOptions): Promise<{ isNew: boolean, widget: TerminalWidget }> {
        let reusableTerminalWidget: TerminalWidget | undefined;
        if (TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(options)) {
            for (const { isDedicated, taskConfig, widget } of this.terminalWidgetMap.values()) {
                // to run a task whose `taskPresentation === 'dedicated'`, the terminal to be reused must be
                // 1) dedicated, 2) idle, and 3) the one that ran the same task
                if (isDedicated &&
                    !widget.hasRunningTask &&
                    taskConfig &&
                    options.taskConfig &&
                    this.taskDefinitionRegistry.compareTasks(options.taskConfig, taskConfig)) {

                    reusableTerminalWidget = widget;
                }
            }
        } else if (TaskTerminalWidgetOpenerOptions.isSharedTerminal(options)) {
            for (const { isDedicated, widget } of this.terminalWidgetMap.values()) {
                // to run a task whose `taskPresentation === 'shared'`, the terminal to be used must be
                // 1) not dedicated, and 2) idle
                if (!isDedicated && !widget.hasRunningTask) {
                    reusableTerminalWidget = widget;
                }
            }
        }

        // we are unable to find a terminal widget to run the task, or `taskPresentation === 'new'`
        if (!reusableTerminalWidget) {
            const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(TERMINAL_WIDGET_FACTORY_ID, options);
            widget.onTerminalDidClose(() => {
                if (this.terminalWidgetMap.has(widget.id)) {
                    this.terminalWidgetMap.delete(widget.id);
                }
            });
            return { isNew: true, widget };
        }
        return { isNew: false, widget: reusableTerminalWidget };
    }
}
