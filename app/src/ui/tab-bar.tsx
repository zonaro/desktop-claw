import * as React from 'react'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { TabBarItem } from './tab-bar-item'
import { TabBarType } from './tab-bar-type'
export { TabBarType } from './tab-bar-type'

/** Time to wait for drag element hover before switching tabs */
const dragTabSwitchWaitTime = 500

interface ITabBarProps {
  /** The currently selected tab. */
  readonly selectedIndex: number

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (index: number) => void

  /** The type of TabBar controlling its style */
  readonly type?: TabBarType

  /** Navigate via drag over */
  readonly allowDragOverSwitching?: boolean
}

/**
 * The tab bar component.
 *
 * Set `children` to an array of JSX.Elements to represent the tab bar items.
 */
export class TabBar extends React.Component<ITabBarProps, {}> {
  private readonly tabRefsByIndex = new Map<number, HTMLButtonElement>()
  private mouseOverTimeoutId: number | null = null

  public render() {
    const { type } = this.props

    return (
      <div
        className={
          'tab-bar ' +
          (type === TabBarType.Switch
            ? 'switch'
            : type === TabBarType.Vertical
            ? 'vertical'
            : 'tabs')
        }
        role="tablist"
      >
        {this.renderItems()}
      </div>
    )
  }

  private onSelectAdjacentTab = (
    direction: 'next' | 'previous',
    index: number
  ) => {
    const children = React.Children.toArray(this.props.children)

    if (children.length === 0) {
      return
    }

    const delta = direction === 'next' ? 1 : -1

    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const nextTabIndex = (index + delta + children.length) % children.length

    const button = this.tabRefsByIndex.get(nextTabIndex)

    if (button) {
      button.focus()
    }

    this.props.onTabClicked(nextTabIndex)
  }

  private onTabClicked = (index: number) => {
    this.props.onTabClicked(index)
  }

  private onTabRef = (index: number, ref: HTMLButtonElement | null) => {
    if (!ref) {
      this.tabRefsByIndex.delete(index)
    } else {
      this.tabRefsByIndex.set(index, ref)
    }
  }

  /**
   * If something is being dragged, this allows for tab selection by hovering
   * over a tab for a few seconds (dragTabSwitchWaitTime)
   */
  private onMouseEnter = (index: number) => {
    if (
      index === this.props.selectedIndex ||
      !dragAndDropManager.isDragInProgress ||
      this.props.allowDragOverSwitching === undefined ||
      !this.props.allowDragOverSwitching
    ) {
      return
    }

    this.mouseOverTimeoutId = window.setTimeout(() => {
      this.onTabClicked(index)
    }, dragTabSwitchWaitTime)
  }

  private onMouseLeave = () => {
    if (this.mouseOverTimeoutId !== null) {
      window.clearTimeout(this.mouseOverTimeoutId)
    }
  }

  private renderItems() {
    const { type, selectedIndex } = this.props
    const children = React.Children.toArray(this.props.children)

    return children.map((child, index) => {
      const selected = index === selectedIndex
      return (
        <React.Fragment key={index}>
          <TabBarItem
            selected={selected}
            index={index}
            onClick={this.onTabClicked}
            onMouseEnter={this.onMouseEnter}
            onMouseLeave={this.onMouseLeave}
            onSelectAdjacent={this.onSelectAdjacentTab}
            onButtonRef={this.onTabRef}
            type={type}
          >
            {child}
          </TabBarItem>
          {type === TabBarType.Switch && index < children.length - 1 && (
            <div className="tab-bar-separator" />
          )}
        </React.Fragment>
      )
    })
  }
}

/**
 * Two-row tab bar for the repository sidebar.
 * Renders primary tabs (Changes, History, Compare) on the first row
 * and secondary tabs (Files, Threads, Agent) on the second row.
 */
export interface ITabConfig {
  readonly id: string
  readonly label: string
  readonly icon?: string
  readonly badge?: React.ReactNode
  readonly tooltip?: string
}

interface ITwoRowTabBarProps {
  /** The currently selected tab ID. */
  readonly selectedTabId: string

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (tabId: string) => void

  /** Primary tabs (top row) */
  readonly primaryTabs: ReadonlyArray<ITabConfig>

  /** Secondary tabs (bottom row) */
  readonly secondaryTabs: ReadonlyArray<ITabConfig>
}

interface ITwoRowTabBarItemProps {
  readonly tab: ITabConfig
  readonly isSelected: boolean
  readonly rowType: 'primary' | 'secondary'
  readonly index: number
  readonly tabsCount: number
  readonly onClick: (tabId: string) => void
  readonly onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabsCount: number,
    index: number,
    rowType: 'primary' | 'secondary'
  ) => void
  readonly onMouseEnter: (tabId: string, rowType: 'primary' | 'secondary') => void
  readonly onMouseLeave: () => void
  readonly onButtonRef: (
    refKey: string,
    button: HTMLButtonElement | null
  ) => void
}

class TwoRowTabBarItem extends React.Component<ITwoRowTabBarItemProps, {}> {
  private onClick = () => {
    this.props.onClick(this.props.tab.id)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    this.props.onKeyDown(event, this.props.tabsCount, this.props.index, this.props.rowType)
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.props.onButtonRef(`${this.props.rowType}-${this.props.tab.id}`, buttonRef)
  }

  private onMouseEnter = () => {
    this.props.onMouseEnter(this.props.tab.id, this.props.rowType)
  }

  public render() {
    const { tab, isSelected, rowType } = this.props
    const className = `tab-bar-item ${rowType} ${isSelected ? 'selected' : ''}`

    return (
      <button
        ref={this.onButtonRef}
        className={className}
        onClick={this.onClick}
        role="tab"
        aria-selected={isSelected}
        aria-controls={`panel-${tab.id}`}
        id={`tab-${tab.id}`}
        tabIndex={isSelected ? 0 : -1}
        onKeyDown={this.onKeyDown}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.props.onMouseLeave}
        type="button"
        aria-label={tab.tooltip}
      >
        <span className="with-indicator">
          {tab.icon && <span className="icon octicon octicon-{tab.icon}" aria-hidden="true" />}
          <span>{tab.label}</span>
          {tab.badge}
        </span>
      </button>
    )
  }
}

export class TwoRowTabBar extends React.Component<ITwoRowTabBarProps, {}> {
  private readonly primaryTabRefs = new Map<string, HTMLButtonElement>()
  private readonly secondaryTabRefs = new Map<string, HTMLButtonElement>()

  private onTabClick = (tabId: string): void => {
    this.props.onTabClicked(tabId)
  }

  private onRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabsCount: number,
    index: number,
    rowType: 'primary' | 'secondary'
  ) => {
    const tabs = rowType === 'primary' ? this.props.primaryTabs : this.props.secondaryTabs
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        const nextIndex = (index + 1) % tabsCount
        this.props.onTabClicked(tabs[nextIndex].id)
        break
      case 'ArrowLeft':
        event.preventDefault()
        const prevIndex = (index - 1 + tabsCount) % tabsCount
        this.props.onTabClicked(tabs[prevIndex].id)
        break
      case 'ArrowDown':
        event.preventDefault()
        // Move to secondary row
        if (rowType === 'primary') {
          const secondaryTabs = this.props.secondaryTabs
          const targetIndex = Math.min(index, secondaryTabs.length - 1)
          this.props.onTabClicked(secondaryTabs[targetIndex].id)
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        // Move to primary row
        if (rowType === 'secondary') {
          const primaryTabs = this.props.primaryTabs
          const targetIndex = Math.min(index, primaryTabs.length - 1)
          this.props.onTabClicked(primaryTabs[targetIndex].id)
        }
        break
      case 'Home':
        event.preventDefault()
        this.props.onTabClicked(tabs[0].id)
        break
      case 'End':
        event.preventDefault()
        this.props.onTabClicked(tabs[tabsCount - 1].id)
        break
    }
  }

  private onMouseEnter = (tabId: string, rowType: 'primary' | 'secondary') => {
    // Could add hover effects for drag-over switching if needed
  }

  private onMouseLeave = () => {
    // Could add hover effects for drag-over switching if needed
  }

  private onButtonRef = (refKey: string, button: HTMLButtonElement | null) => {
    const refs = refKey.startsWith('primary-') ? this.primaryTabRefs : this.secondaryTabRefs
    if (!button) {
      refs.delete(refKey)
    } else {
      refs.set(refKey, button)
    }
  }

  public render() {
    return (
      <div className="two-row-tab-bar" role="tablist">
        <div className="tab-bar-row primary" role="tablist" aria-label="Primary actions">
          {this.renderTabRow(this.props.primaryTabs, 'primary')}
        </div>
        <div className="tab-bar-row secondary" role="tablist" aria-label="Repository tools">
          {this.renderTabRow(this.props.secondaryTabs, 'secondary')}
        </div>
      </div>
    )
  }

  private renderTabRow(
    tabs: ReadonlyArray<ITabConfig>,
    rowType: 'primary' | 'secondary'
  ) {
    return tabs.map((tab, index) => (
      <TwoRowTabBarItem
        key={tab.id}
        tab={tab}
        isSelected={tab.id === this.props.selectedTabId}
        rowType={rowType}
        index={index}
        tabsCount={tabs.length}
        onClick={this.onTabClick}
        onKeyDown={this.onRowKeyDown}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
        onButtonRef={this.onButtonRef}
      />
    ))
  }
}
