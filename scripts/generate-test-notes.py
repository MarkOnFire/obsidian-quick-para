#!/usr/bin/env python3
"""
Generate test markdown files for Quick PARA performance benchmarking.

This script creates realistic test notes with:
- Proper frontmatter (tags, PARA property, created date)
- Randomized content (headings, paragraphs, lists, tasks)
- Distributed across PARA folders and subfolders
- Varied file sizes and complexity

Usage:
    python3 generate-test-notes.py --size small
    python3 generate-test-notes.py --size medium
    python3 generate-test-notes.py --size large
    python3 generate-test-notes.py --count 100 --custom

WARNING: This script ONLY works with Test Vault to prevent accidental data loss.
"""

import argparse
import os
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

# SAFETY: Hard-coded to Test Vault only
TEST_VAULT_PATH = Path("/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault")

# Test vault sizes (file counts)
VAULT_SIZES = {
    'small': 50,
    'medium': 500,
    'large': 1000
}

# PARA folder structure
PARA_FOLDERS = {
    'inbox': '0 - INBOX',
    'projects': '1 - PROJECTS',
    'areas': '2 - AREAS',
    'resources': '3 - RESOURCES',
    'archive': '4 - ARCHIVE'
}

# Subfolders for each PARA category (for realistic testing)
SUBFOLDERS = {
    'projects': ['work', 'personal', 'learning'],
    'areas': ['health', 'finance', 'home'],
    'resources': ['reference', 'guides', 'templates'],
    'archive': ['2024', '2023']
}

# Sample content for realistic notes
SAMPLE_HEADINGS = [
    'Overview', 'Goals', 'Tasks', 'Notes', 'Ideas', 'Research',
    'Progress', 'Next Steps', 'References', 'Questions'
]

SAMPLE_PARAGRAPHS = [
    'This is a test note generated for performance benchmarking.',
    'The Quick PARA plugin should efficiently handle tagging and metadata updates.',
    'Performance profiling helps identify bottlenecks in the plugin architecture.',
    'Mobile optimization is critical for large vaults with 1000+ notes.',
    'Event listeners need to be efficient to avoid UI lag during file operations.'
]

SAMPLE_TASKS = [
    'Review project documentation',
    'Update status report',
    'Schedule team meeting',
    'Research implementation options',
    'Test new feature',
    'Write summary notes',
    'Archive completed items',
    'Follow up with stakeholders'
]


def validate_vault_path():
    """Ensure we're only working with Test Vault"""
    if not TEST_VAULT_PATH.exists():
        print(f"❌ ERROR: Test Vault not found at {TEST_VAULT_PATH}")
        print("Please create the Test Vault in Obsidian first.")
        sys.exit(1)

    if 'Test Vault' not in str(TEST_VAULT_PATH):
        print(f"❌ SAFETY ERROR: Path does not contain 'Test Vault': {TEST_VAULT_PATH}")
        print("This script is restricted to Test Vault only.")
        sys.exit(1)

    print(f"✅ Validated Test Vault path: {TEST_VAULT_PATH}")


def ensure_para_folders():
    """Create PARA folder structure if it doesn't exist"""
    for location, folder_name in PARA_FOLDERS.items():
        folder_path = TEST_VAULT_PATH / folder_name
        folder_path.mkdir(exist_ok=True)

        # Create subfolders
        if location in SUBFOLDERS:
            for subfolder in SUBFOLDERS[location]:
                (folder_path / subfolder).mkdir(exist_ok=True)

    print(f"✅ Ensured PARA folder structure exists")


def generate_frontmatter(para_location, tags=None, has_tasks=False):
    """Generate realistic frontmatter for a test note"""
    if tags is None:
        tags = ['all']

    # Random created date within last 6 months
    days_ago = random.randint(0, 180)
    created_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')

    # Archive gets an archived date
    archived_line = ''
    if para_location == 'archive':
        archived_date = (datetime.now() - timedelta(days=random.randint(1, 30))).strftime('%Y-%m-%d')
        archived_line = f'\narchived: {archived_date}'

    frontmatter = f"""---
tags: {tags}
para: {para_location}
created: {created_date}{archived_line}
---

"""
    return frontmatter


def generate_content(include_tasks=True):
    """Generate realistic note content"""
    content = []

    # Random number of sections (1-4)
    num_sections = random.randint(1, 4)

    for _ in range(num_sections):
        # Section heading
        heading = random.choice(SAMPLE_HEADINGS)
        content.append(f"\n## {heading}\n")

        # Random paragraphs (1-3)
        num_paragraphs = random.randint(1, 3)
        for _ in range(num_paragraphs):
            paragraph = random.choice(SAMPLE_PARAGRAPHS)
            content.append(f"\n{paragraph}\n")

        # Maybe add a list
        if random.random() > 0.5:
            num_items = random.randint(2, 5)
            for _ in range(num_items):
                content.append(f"- {random.choice(SAMPLE_PARAGRAPHS)}\n")

    # Add tasks section if requested
    if include_tasks:
        content.append("\n## Tasks\n")
        num_tasks = random.randint(2, 6)
        for _ in range(num_tasks):
            task = random.choice(SAMPLE_TASKS)
            # Mix of open and completed tasks
            checkbox = '[ ]' if random.random() > 0.3 else '[x]'
            content.append(f"- {checkbox} {task}\n")

    return ''.join(content)


def generate_note(para_location, subfolder=None, index=1, include_tasks=True):
    """Generate a single test note"""
    # Determine file location
    para_folder = PARA_FOLDERS[para_location]

    if subfolder:
        folder_path = TEST_VAULT_PATH / para_folder / subfolder
        # Subfolder tag
        subfolder_tag = subfolder.lower().replace(' ', '-')
        tags = ['all', subfolder_tag]
    else:
        folder_path = TEST_VAULT_PATH / para_folder
        tags = ['all']

    # Generate filename
    filename = f"Test Note {index:04d}.md"
    file_path = folder_path / filename

    # Generate content
    frontmatter = generate_frontmatter(para_location, tags, has_tasks=include_tasks)
    content = generate_content(include_tasks=include_tasks)

    # Write file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(frontmatter)
        f.write(content)

    return file_path


def count_existing_test_notes():
    """Count how many test notes already exist"""
    count = 0
    for para_folder in PARA_FOLDERS.values():
        folder_path = TEST_VAULT_PATH / para_folder
        if folder_path.exists():
            for file_path in folder_path.rglob('Test Note *.md'):
                count += 1
    return count


def clean_test_notes():
    """Remove all existing test notes (safety: Test Vault only)"""
    validate_vault_path()

    count = 0
    for para_folder in PARA_FOLDERS.values():
        folder_path = TEST_VAULT_PATH / para_folder
        if folder_path.exists():
            for file_path in folder_path.rglob('Test Note *.md'):
                file_path.unlink()
                count += 1

    print(f"🗑️  Deleted {count} test notes from Test Vault")
    return count


def generate_test_vault(target_count, include_tasks=True):
    """Generate a test vault with specified number of notes"""
    validate_vault_path()
    ensure_para_folders()

    # Clean existing test notes first
    existing = count_existing_test_notes()
    if existing > 0:
        print(f"⚠️  Found {existing} existing test notes. Cleaning...")
        clean_test_notes()

    print(f"\n📝 Generating {target_count} test notes...")

    # Distribute notes across PARA folders (weighted distribution)
    # 10% inbox, 40% projects, 20% areas, 20% resources, 10% archive
    distribution = {
        'inbox': int(target_count * 0.10),
        'projects': int(target_count * 0.40),
        'areas': int(target_count * 0.20),
        'resources': int(target_count * 0.20),
        'archive': int(target_count * 0.10)
    }

    index = 1
    created = 0

    for location, count in distribution.items():
        print(f"\n  {PARA_FOLDERS[location]}: {count} notes")

        # Half in subfolders, half in root
        if location in SUBFOLDERS:
            root_count = count // 2
            subfolder_count = count - root_count

            # Root notes
            for _ in range(root_count):
                generate_note(location, subfolder=None, index=index, include_tasks=include_tasks)
                index += 1
                created += 1

            # Subfolder notes (distributed evenly)
            subfolders = SUBFOLDERS[location]
            per_subfolder = subfolder_count // len(subfolders)

            for subfolder in subfolders:
                for _ in range(per_subfolder):
                    generate_note(location, subfolder=subfolder, index=index, include_tasks=include_tasks)
                    index += 1
                    created += 1
        else:
            # No subfolders
            for _ in range(count):
                generate_note(location, subfolder=None, index=index, include_tasks=include_tasks)
                index += 1
                created += 1

    print(f"\n✅ Created {created} test notes in Test Vault")
    return created


def main():
    parser = argparse.ArgumentParser(
        description='Generate test notes for Quick PARA performance benchmarking (Test Vault only)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --size small          # Generate 50 test notes
  %(prog)s --size medium         # Generate 500 test notes
  %(prog)s --size large          # Generate 1000 test notes
  %(prog)s --count 100           # Generate exactly 100 test notes
  %(prog)s --clean               # Remove all test notes
  %(prog)s --no-tasks --size small  # Generate notes without tasks

Vault sizes:
  small:  50 notes
  medium: 500 notes
  large:  1000 notes
        """
    )

    parser.add_argument(
        '--size',
        choices=['small', 'medium', 'large'],
        help='Preset vault size (small=50, medium=500, large=1000)'
    )

    parser.add_argument(
        '--count',
        type=int,
        help='Custom number of notes to generate'
    )

    parser.add_argument(
        '--clean',
        action='store_true',
        help='Remove all existing test notes'
    )

    parser.add_argument(
        '--no-tasks',
        action='store_true',
        help='Generate notes without task sections'
    )

    args = parser.parse_args()

    # Clean mode
    if args.clean:
        clean_test_notes()
        return

    # Determine target count
    if args.size:
        target_count = VAULT_SIZES[args.size]
        print(f"🎯 Target vault size: {args.size} ({target_count} notes)")
    elif args.count:
        target_count = args.count
        print(f"🎯 Custom vault size: {target_count} notes")
    else:
        parser.print_help()
        print("\n❌ ERROR: Must specify --size or --count")
        sys.exit(1)

    # Generate vault
    include_tasks = not args.no_tasks
    generate_test_vault(target_count, include_tasks=include_tasks)

    print(f"\n✅ Test vault ready for benchmarking!")
    print(f"\nNext steps:")
    print(f"1. Open Test Vault in Obsidian")
    print(f"2. Enable profiling in Quick PARA settings")
    print(f"3. Follow performance profiling guide: docs/PERFORMANCE-PROFILING.md")


if __name__ == '__main__':
    main()
