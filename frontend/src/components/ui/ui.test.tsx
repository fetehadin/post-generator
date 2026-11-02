import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

// The adapted shadcn/ui parts keep Radix's accessibility: roles, keyboard and focus.

test('a menu opens from its button and its items are reachable by keyboard', async () => {
  const picked: string[] = []
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>More</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => picked.push('x')}>Make an X version</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Discard</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'More' }))
  expect(await screen.findByRole('menu')).toBeInTheDocument()
  await userEvent.keyboard('{ArrowDown}{Enter}')
  expect(picked).toEqual(['x'])
})

test('a dialog has a title, a description and a labelled close button', async () => {
  render(
    <Dialog>
      <DialogTrigger>Delete forever</DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete this draft?</DialogTitle>
        <DialogDescription>This can't be undone.</DialogDescription>
      </DialogContent>
    </Dialog>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete this draft?' })
  expect(dialog).toHaveAccessibleDescription("This can't be undone.")
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('tabs switch with the arrow keys', async () => {
  render(
    <Tabs defaultValue="about">
      <TabsList>
        <TabsTrigger value="about">About you</TabsTrigger>
        <TabsTrigger value="work">Work</TabsTrigger>
      </TabsList>
      <TabsContent value="about">Role</TabsContent>
      <TabsContent value="work">Projects</TabsContent>
    </Tabs>,
  )
  await userEvent.click(screen.getByRole('tab', { name: 'About you' }))
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Projects')
})
